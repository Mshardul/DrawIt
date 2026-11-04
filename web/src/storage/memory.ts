import { assertFitsLimit, StorageError } from "./adapter.ts";
import type { FileInfo, Preferences, StorageAdapter, TopEntry, TopListing, Unsubscribe, WatchEvent, WorkspaceInfo, WorkspaceTarget } from "./adapter.ts";

export interface MemoryPlace {
  files?: Record<string, string | Uint8Array>;
  folders?: string[];
}

export interface MemoryVolumeOptions {
  /** Clock for `modified`; injected by tests. */
  now?: () => Date;
  path?: string;
  library?: string;
  files?: Record<string, string | Uint8Array>;
  folders?: string[];
  places?: Record<string, MemoryPlace>;
}

interface Entry {
  data: Uint8Array;
  modified: string;
}

interface Place {
  files: Map<string, Entry>;
  folders: Map<string, string>;
}

export interface MemoryStorageOptions {
  /** Clock for `modified`; injected by tests. */
  now?: () => Date;
  /** Share one volume across tabs. Present only for a tab joined to an existing volume. */
  volume?: MemoryVolume;
}

/**
 * Cleans a path as the server does: `.` and empty segments go, `..` steps up. A path that is
 * empty after cleaning or leaves the folder is not a file path inside it.
 */
function clean(path: string): string {
  const parts: string[] = [];
  if (path.includes("\0") || path.startsWith("/")) throw new StorageError("invalid-path", `Not a file path inside the folder: ${JSON.stringify(path)}`);
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (parts.pop() === undefined) throw new StorageError("invalid-path", `Path leaves the folder: ${JSON.stringify(path)}`);
    } else {
      parts.push(part);
    }
  }
  if (parts.length === 0) throw new StorageError("invalid-path", `Not a file path inside the folder: ${JSON.stringify(path)}`);
  return parts.join("/");
}

/** Orders paths as Go's `fs.WalkDir` visits them: by name within each folder, so `a/b` comes before `a.txt`. */
function walkOrder(a: string, b: string): number {
  const left = a.split("/");
  const right = b.split("/");
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const l = left[i] ?? "";
    const r = right[i] ?? "";
    if (l !== r) return l < r ? -1 : 1;
  }
  return left.length - right.length;
}

function bytesOf(content: string | Uint8Array): Uint8Array {
  return typeof content === "string" ? new TextEncoder().encode(content) : content.slice();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function makePlace(files: Record<string, string | Uint8Array>, folders: string[], now: () => Date): Place {
  const place: Place = { files: new Map(), folders: new Map() };
  for (const [path, content] of Object.entries(files)) {
    place.files.set(clean(path), { data: bytesOf(content), modified: now().toISOString() });
  }
  for (const folder of folders) place.folders.set(folder, now().toISOString());
  return place;
}

function isFolder(place: Place, path: string): boolean {
  if (place.folders.has(path)) return true;
  const prefix = `${path}/`;
  for (const key of place.files.keys()) if (key.startsWith(prefix)) return true;
  return false;
}

function kindOf(folder: string, library: string): WorkspaceInfo["kind"] {
  if (folder === "") return "opened";
  if (library === "") return "opened";
  if (folder === library) return "library";
  if (folder.startsWith(`${library}/`)) return "project";
  return "opened";
}

function singleName(name: string): boolean {
  return name !== "" && name !== "." && name !== ".." && !name.includes("/") && !name.includes("\\");
}

function revision(entries: TopEntry[]): string {
  let hash = 2166136261;
  for (const entry of entries) {
    const size = entry.type === "file" ? String(entry.size) : "0";
    const diagrams = entry.type === "folder" ? String(entry.diagrams) : "";
    const line = `${entry.type}\t${entry.path}\t${size}\t${entry.modified}\t${diagrams}`;
    for (let i = 0; i < line.length; i++) {
      hash ^= line.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  }
  return (hash >>> 0).toString(16);
}

/** One in-memory server: files, the open workspace, preferences and the single session. */
export class MemoryVolume {
  readonly #now: () => Date;
  readonly #library: string;
  readonly #places = new Map<string, Place>();
  #place: Place;
  #path: string;
  #workspaceId: string;
  #sessionId = "";
  #prefs: Preferences = { version: 1 };
  #seq = 0;

  constructor(options: MemoryVolumeOptions = {}) {
    this.#now = options.now ?? (() => new Date());
    this.#library = options.library ?? "";
    this.#path = options.path ?? "";
    this.#place = makePlace(options.files ?? {}, options.folders ?? [], this.#now);
    this.#places.set(this.#path, this.#place);
    for (const [path, place] of Object.entries(options.places ?? {})) {
      this.#places.set(path, makePlace(place.files ?? {}, place.folders ?? [], this.#now));
    }
    this.#workspaceId = this.#mint("w");
  }

  tab(): MemoryStorage {
    return new MemoryStorage({}, { volume: this });
  }

  claim(presented: string, takeover: boolean): string {
    const held = this.#sessionId !== "" && presented !== "" && presented === this.#sessionId;
    if (takeover || this.#sessionId === "" || held) {
      if (takeover || this.#sessionId === "" || !held) this.#sessionId = this.#mint("s");
      return this.#sessionId;
    }
    throw new StorageError("open-elsewhere", "DrawIt is open elsewhere");
  }

  allow(session: string): void {
    if (this.#sessionId === "" || session !== this.#sessionId) throw new StorageError("session-lost", "session lost");
  }

  workspace(): WorkspaceInfo {
    return { id: this.#workspaceId, kind: kindOf(this.#path, this.#library), path: this.#path };
  }

  open(target: WorkspaceTarget): WorkspaceInfo {
    const path = this.#targetPath(target);
    const place = this.#places.get(path);
    if (!place) throw new StorageError("not-found", "not found");
    this.#place = place;
    this.#path = path;
    this.#workspaceId = this.#mint("w");
    return this.workspace();
  }

  list(): FileInfo[] {
    const infos = [...this.#place.files.entries()].map(([path, entry]) => ({ path, size: entry.data.length, modified: entry.modified }));
    return infos.sort((a, b) => walkOrder(a.path, b.path));
  }

  listTop(): TopListing {
    const rows = new Map<string, TopEntry>();
    for (const [name, modified] of this.#place.folders) {
      rows.set(name, { path: name, type: "folder", modified, diagrams: 0 });
    }
    for (const [path, entry] of this.#place.files) {
      const slash = path.indexOf("/");
      if (slash < 0) {
        rows.set(path, { path, type: "file", size: entry.data.length, modified: entry.modified });
        continue;
      }
      const dir = path.slice(0, slash);
      const current = rows.get(dir);
      const folder: TopEntry = current?.type === "folder" ? current : { path: dir, type: "folder", modified: entry.modified, diagrams: 0 };
      if (entry.modified > folder.modified) folder.modified = entry.modified;
      const rest = path.slice(slash + 1);
      if (!rest.includes("/") && path.endsWith(".drawit.kdl")) {
        folder.diagrams += 1;
        if (!folder.latest || entry.modified > folder.latest.modified) folder.latest = { path, modified: entry.modified };
      }
      rows.set(dir, folder);
    }
    const entries = [...rows.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    return { revision: revision(entries), entries };
  }

  stat(path: string): FileInfo {
    const clear = clean(path);
    const entry = this.#place.files.get(clear);
    if (!entry) throw isFolder(this.#place, clear) ? new StorageError("invalid-path", `${clear} is a folder`) : new StorageError("not-found", `No file ${clear}`);
    return { path: clear, size: entry.data.length, modified: entry.modified };
  }

  read(path: string): Uint8Array {
    const info = this.stat(path);
    const entry = this.#place.files.get(info.path);
    if (!entry) throw new StorageError("not-found", `No file ${info.path}`);
    return entry.data.slice();
  }

  write(path: string, data: Uint8Array): WatchEvent {
    const clear = clean(path);
    assertFitsLimit(clear, data);
    if (isFolder(this.#place, clear)) throw new StorageError("invalid-path", `${clear} is a folder`);
    const segments = clear.split("/");
    for (let i = 1; i < segments.length; i++) {
      const parent = segments.slice(0, i).join("/");
      if (this.#place.files.has(parent)) throw new StorageError("invalid-path", `${parent} is a file, not a folder`);
    }
    const existed = this.#place.files.has(clear);
    this.#place.files.set(clear, { data: data.slice(), modified: this.#now().toISOString() });
    return { type: existed ? "changed" : "created", path: clear };
  }

  remove(path: string): WatchEvent {
    const clear = clean(path);
    if (!this.#place.files.delete(clear)) throw new StorageError("not-found", `No file ${clear}`);
    return { type: "removed", path: clear };
  }

  readPreferences(): Preferences {
    return structuredClone(this.#prefs);
  }

  patchPreferences(patch: Record<string, Record<string, unknown>>): Preferences {
    if (!isPlainObject(patch)) throw new StorageError("invalid-path", "patch must be an object of objects");
    for (const [key, value] of Object.entries(patch)) {
      if (key === "version" || !isPlainObject(value)) throw new StorageError("invalid-path", "patch must be an object of objects");
    }
    const next = structuredClone(this.#prefs);
    for (const [key, value] of Object.entries(patch)) {
      const base = isPlainObject(next[key]) ? next[key] : {};
      next[key] = { ...base, ...value };
    }
    if (!("version" in next)) next.version = 1;
    this.#prefs = next;
    return structuredClone(next);
  }

  #targetPath(target: WorkspaceTarget): string {
    if ("library" in target) {
      if (this.#library === "") throw new StorageError("not-found", "not found");
      return this.#library;
    }
    if ("project" in target) {
      if (!singleName(target.project)) throw new StorageError("invalid-path", "project name must be a single folder name");
      if (this.#library === "") throw new StorageError("not-found", "not found");
      return `${this.#library}/${target.project}`;
    }
    if ("folder" in target) {
      if (!target.folder.startsWith("/")) throw new StorageError("invalid-path", "folder must be an absolute path");
      return target.folder;
    }
    if (!target.file.startsWith("/")) throw new StorageError("invalid-path", "file must be an absolute path");
    const slash = target.file.lastIndexOf("/");
    const dir = target.file.slice(0, slash);
    const name = target.file.slice(slash + 1);
    const place = this.#places.get(dir);
    if (!place?.files.has(name)) throw new StorageError("not-found", "not found");
    return dir;
  }

  #mint(prefix: string): string {
    this.#seq += 1;
    return `${prefix}${String(this.#seq)}`;
  }
}

/** A workspace held in memory, for tests. Behaves as the server's API does. */
export class MemoryStorage implements StorageAdapter {
  readonly #volume: MemoryVolume;
  readonly #enforced: boolean;
  readonly #listeners = new Set<(event: WatchEvent) => void>();
  #session = "";

  constructor(files: Record<string, string | Uint8Array> = {}, options: MemoryStorageOptions = {}) {
    this.#volume = options.volume ?? new MemoryVolume({ files, now: options.now });
    this.#enforced = options.volume !== undefined;
  }

  list(): Promise<FileInfo[]> {
    try {
      this.#gate();
      return Promise.resolve(this.#volume.list());
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  read(path: string): Promise<Uint8Array> {
    try {
      this.#gate();
      return Promise.resolve(this.#volume.read(path));
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  write(path: string, data: Uint8Array): Promise<void> {
    try {
      this.#gate();
      this.#emit(this.#volume.write(path, data));
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  watch(listener: (event: WatchEvent) => void): Unsubscribe {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  currentWorkspace(): Promise<WorkspaceInfo> {
    try {
      this.#gate();
      return Promise.resolve(this.#volume.workspace());
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  openWorkspace(target: WorkspaceTarget): Promise<WorkspaceInfo> {
    try {
      this.#gate();
      return Promise.resolve(this.#volume.open(target));
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  listTop(): Promise<TopListing> {
    try {
      this.#gate();
      return Promise.resolve(this.#volume.listTop());
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  stat(path: string): Promise<FileInfo> {
    try {
      this.#gate();
      return Promise.resolve(this.#volume.stat(path));
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  claimSession(): Promise<string> {
    try {
      this.#session = this.#volume.claim(this.#session, false);
      return Promise.resolve(this.#session);
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  takeoverSession(): Promise<string> {
    try {
      this.#session = this.#volume.claim(this.#session, true);
      return Promise.resolve(this.#session);
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  readPreferences(): Promise<Preferences> {
    try {
      this.#gate();
      return Promise.resolve(this.#volume.readPreferences());
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  patchPreferences(patch: Record<string, Record<string, unknown>>): Promise<Preferences> {
    try {
      this.#gate();
      return Promise.resolve(this.#volume.patchPreferences(patch));
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /** Deletes a file, as a change made outside the app would. The adapter interface has no delete yet. */
  remove(path: string): void {
    this.#emit(this.#volume.remove(path));
  }

  #gate(): void {
    if (this.#enforced) this.#volume.allow(this.#session);
  }

  #emit(event: WatchEvent): void {
    for (const listener of this.#listeners) listener(event);
  }
}
