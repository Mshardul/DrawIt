import { assertFitsLimit, StorageError } from "./adapter.ts";
import type { BrowseListing, FileInfo, ImportedFile, Preferences, StorageAdapter, TopEntry, TopListing, Unsubscribe, WatchEvent, WorkspaceInfo, WorkspaceTarget } from "./adapter.ts";

export interface MemoryPlace {
  files?: Record<string, string | Uint8Array>;
  folders?: string[];
}

export interface MemoryCatalog {
  folders?: string[];
  files?: string[];
}

export interface MemoryVolumeOptions {
  /** Clock for `modified`; injected by tests. */
  now?: () => Date;
  path?: string;
  library?: string;
  files?: Record<string, string | Uint8Array>;
  folders?: string[];
  places?: Record<string, MemoryPlace>;
  /** Absolute directories the folder browser lists. Absent directories are not found. */
  catalog?: Record<string, MemoryCatalog>;
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

const DIAGRAM_EXT = ".drawit.kdl";
const EMPTY_DIAGRAM = "diagram version=1\n";
const BROWSE_LIMIT = 500;

class TrashMissing extends Error {
  constructor() {
    super("no trash");
    this.name = "TrashMissing";
  }
}

interface CatalogNode {
  folders: Set<string>;
  files: Set<string>;
}

interface LibraryBody {
  project?: string;
  diagram?: string;
  draft?: boolean;
  from?: string;
  to?: string;
  delete?: string;
  noTrash?: boolean;
  copy?: string;
  into?: string;
}

function allowedName(name: string, diagram: boolean): boolean {
  if (name === "" || name.includes("/") || name.includes("\\")) return false;
  const bytes = new TextEncoder().encode(name).length + (diagram ? DIAGRAM_EXT.length : 0);
  if (bytes > 255) return false;
  for (const char of name) {
    if (char === " " || char === "-" || char === "_" || /\p{L}/u.test(char) || /\p{N}/u.test(char)) continue;
    return false;
  }
  return !windowsReserved(name);
}

function windowsReserved(name: string): boolean {
  const dot = name.indexOf(".");
  const base = (dot >= 0 ? name.slice(0, dot) : name).replace(/ +$/, "");
  const upper = base.toUpperCase();
  if (upper === "CON" || upper === "PRN" || upper === "AUX" || upper === "NUL") return true;
  if (base.length === 4) {
    const head = upper.slice(0, 3);
    const last = base[3] ?? "";
    if ((head === "COM" || head === "LPT") && last >= "1" && last <= "9") return true;
  }
  return false;
}

function nameTaken(names: readonly string[], name: string, ignore: string): boolean {
  for (const entry of names) {
    if (ignore !== "" && entry === ignore) continue;
    if (entry.toLowerCase() === name.toLowerCase()) return true;
  }
  return false;
}

function matchName(names: readonly string[], name: string): string | undefined {
  let folded: string | undefined;
  for (const entry of names) {
    if (entry === name) return entry;
    if (folded === undefined && entry.toLowerCase() === name.toLowerCase()) folded = entry;
  }
  return folded;
}

function parentPath(path: string): string {
  if (path === "" || path === "/") return "/";
  const slash = path.lastIndexOf("/");
  return slash <= 0 ? "/" : path.slice(0, slash);
}

function absolutePath(path: string): string {
  if (!path.startsWith("/")) throw new StorageError("invalid-path", "folder must be an absolute path");
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.length === 0 ? "/" : `/${parts.join("/")}`;
}

function withinHome(home: string, path: string): boolean {
  if (home === "/") return path.startsWith("/");
  return path === home || path.startsWith(`${home}/`);
}

function joinPath(dir: string, name: string): string {
  return dir === "/" ? `/${name}` : `${dir}/${name}`;
}

function libraryAction(body: LibraryBody): string {
  const draft = body.draft === true;
  const project = body.project !== undefined;
  const diagram = body.diagram !== undefined;
  const from = body.from !== undefined;
  const to = body.to !== undefined;
  const del = body.delete !== undefined;
  const copy = body.copy !== undefined;
  const into = body.into !== undefined;
  if (draft && !project && !diagram && !from && !to && !del && !copy && !into) return "draft";
  if (project && !draft && !diagram && !from && !to && !del && !copy && !into) return "project";
  if (project && diagram && !draft && !from && !to && !del && !copy && !into) return "diagram";
  if (from && to && !draft && !project && !diagram && !del && !copy && !into) return "rename";
  if (del && !draft && !project && !diagram && !from && !to && !copy && !into) return "delete";
  if (copy && into && !draft && !project && !diagram && !from && !to && !del) return "copy";
  return "";
}

function splitExt(base: string): { stem: string; ext: string } {
  if (base.endsWith(DIAGRAM_EXT)) return { stem: base.slice(0, -DIAGRAM_EXT.length), ext: DIAGRAM_EXT };
  const dot = base.lastIndexOf(".");
  if (dot > 0) return { stem: base.slice(0, dot), ext: base.slice(dot) };
  return { stem: base, ext: "" };
}

function freeName(taken: (relative: string) => boolean, relative: string): string {
  if (!taken(relative)) return relative;
  const slash = relative.lastIndexOf("/");
  const dir = slash < 0 ? "" : relative.slice(0, slash + 1);
  const { stem, ext } = splitExt(slash < 0 ? relative : relative.slice(slash + 1));
  for (let n = 2; n <= 10000; n++) {
    const candidate = `${dir}${stem} ${String(n)}${ext}`;
    if (!taken(candidate)) return candidate;
  }
  throw new StorageError("conflict", "name exists");
}

function importRelative(path: string): string {
  if (path.includes("\\") || path.includes("\0") || path.startsWith("/") || path.includes("..")) {
    throw new StorageError("invalid-path", "name is not allowed");
  }
  const parts = path.split("/");
  if (parts.some((part) => part === "" || part === "." || part.startsWith("."))) {
    throw new StorageError("invalid-path", "name is not allowed");
  }
  if (parts.length === 1 && parts[0]) return parts[0];
  if (parts.length === 2 && parts[0] === "assets" && parts[1]) return path;
  throw new StorageError("invalid-path", "name is not allowed");
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
  #trashMode: "ok" | "missing" = "ok";
  #home = "/";
  #catalog = new Map<string, CatalogNode>();

  constructor(options: MemoryVolumeOptions = {}) {
    this.#now = options.now ?? (() => new Date());
    this.#library = options.library ?? "";
    this.#path = options.path ?? "";
    this.#place = makePlace(options.files ?? {}, options.folders ?? [], this.#now);
    this.#places.set(this.#path, this.#place);
    for (const [path, place] of Object.entries(options.places ?? {})) {
      this.#places.set(path, makePlace(place.files ?? {}, place.folders ?? [], this.#now));
    }
    this.#home = parentPath(this.#library);
    for (const [dir, node] of Object.entries(options.catalog ?? {})) {
      this.#catalog.set(absolutePath(dir), { folders: new Set(node.folders ?? []), files: new Set(node.files ?? []) });
    }
    this.#workspaceId = this.#mint("w");
  }

  useTrash(mode: "ok" | "missing"): void {
    this.#trashMode = mode;
  }

  changeLibrary(body: LibraryBody): string {
    switch (libraryAction(body)) {
      case "project":
        return this.createProject(body.project ?? "");
      case "draft":
        return this.createDraft();
      case "diagram":
        return this.createDiagram(body.project ?? "", body.diagram ?? "");
      case "rename":
        return this.renameItem(body.from ?? "", body.to ?? "");
      case "delete":
        return this.deleteItem(body.delete ?? "", body.noTrash === true);
      case "copy":
        return this.copyFile(body.copy ?? "", body.into ?? "");
      default:
        throw new StorageError("invalid-path", "name one library change");
    }
  }

  createProject(name: string): string {
    if (!allowedName(name, false)) throw new StorageError("invalid-path", "name is not allowed");
    if (matchName(this.#projectNames(), name)) throw new StorageError("conflict", "name exists");
    this.#addProject(name);
    return name;
  }

  createDraft(): string {
    const folder = this.#draftsFolder();
    const file = this.#nextDraft(this.#childNames(folder));
    const rel = `${folder}/${file}`;
    this.#writeLibrary(rel, bytesOf(EMPTY_DIAGRAM));
    return rel;
  }

  createDiagram(project: string, name: string): string {
    if (!allowedName(project, false) || !allowedName(name, true)) throw new StorageError("invalid-path", "name is not allowed");
    const folder = this.#projectFolder(project);
    const file = `${name}${DIAGRAM_EXT}`;
    if (nameTaken(this.#childNames(folder), file, "")) throw new StorageError("conflict", "name exists");
    const rel = `${folder}/${file}`;
    this.#writeLibrary(rel, bytesOf(EMPTY_DIAGRAM));
    return rel;
  }

  renameItem(from: string, to: string): string {
    const rel = clean(from);
    if (!rel.includes("/")) return this.#renameProject(rel, to);
    const slash = rel.indexOf("/");
    const project = rel.slice(0, slash);
    const file = rel.slice(slash + 1);
    if (file.includes("/") || !file.endsWith(DIAGRAM_EXT)) throw new StorageError("invalid-path", "not a project or a diagram");
    return this.#renameDiagram(project, file, to);
  }

  deleteItem(path: string, noTrash = false): string {
    const rel = clean(path);
    if (!this.#deletable(rel)) throw new StorageError("invalid-path", "not a project or a diagram");
    if (!this.#libraryHas(rel)) throw new StorageError("not-found", "not found");
    try {
      this.#trashMove(rel);
    } catch (error) {
      if (!(error instanceof TrashMissing)) throw error;
      if (!noTrash) throw new StorageError("conflict", "no trash");
      this.#erase(rel);
    }
    return rel;
  }

  copyFile(from: string, dir: string): string {
    const rel = clean(from);
    const source = this.#lib().files.get(rel);
    if (!source) throw new StorageError("not-found", "not found");
    const project = this.#copyProject(dir);
    const intoAssets = dir.endsWith("/assets");
    const base = rel.slice(rel.lastIndexOf("/") + 1);
    const relative = intoAssets ? `assets/${base}` : base;
    const free = freeName((candidate) => nameTaken(this.#projectFiles(project), candidate, ""), relative);
    if (intoAssets) this.#ensureAssets(project);
    const dest = `${project}/${free}`;
    this.#writeLibrary(dest, source.data.slice());
    return dest;
  }

  importFiles(project: string, files: readonly ImportedFile[]): string[] {
    if (files.length === 0) throw new StorageError("invalid-path", "name a file");
    const folder = this.#projectFolder(project);
    const relative: string[] = [];
    for (const file of files) {
      assertFitsLimit(file.path, file.data);
      relative.push(importRelative(file.path));
    }
    const taken = new Set(this.#projectFiles(folder).map((name) => name.toLowerCase()));
    const chosen: string[] = [];
    for (const path of relative) {
      const free = freeName((candidate) => taken.has(candidate.toLowerCase()), path);
      chosen.push(free);
      taken.add(free.toLowerCase());
    }
    if (chosen.some((path) => path.startsWith("assets/"))) this.#ensureAssets(folder);
    const written: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const rel = `${folder}/${chosen[i] ?? ""}`;
      this.#writeLibrary(rel, (files[i]?.data ?? new Uint8Array()).slice());
      written.push(rel);
    }
    return written;
  }

  readLibrary(path: string): Uint8Array {
    const rel = clean(path);
    const entry = this.#lib().files.get(rel);
    if (!entry) throw new StorageError("not-found", "not found");
    return entry.data.slice();
  }

  replaceLibrary(path: string, data: Uint8Array): void {
    const rel = clean(path);
    assertFitsLimit(rel, data);
    if (!this.#lib().files.has(rel)) throw new StorageError("not-found", "not found");
    this.#writeLibrary(rel, data);
  }

  browse(path = ""): BrowseListing {
    const dir = path === "" ? this.#home : absolutePath(path);
    if (!withinHome(this.#home, dir)) throw new StorageError("refused", "path is outside the home directory");
    if (this.#catalogFile(dir)) throw new StorageError("invalid-path", "path is not a folder");
    const node = this.#catalog.get(dir);
    if (!node) throw new StorageError("not-found", "not found");
    const entries: BrowseListing["entries"] = [];
    for (const name of node.folders) {
      if (!name.startsWith(".")) entries.push({ name, type: "folder" });
    }
    for (const name of node.files) {
      if (!name.startsWith(".") && name.endsWith(DIAGRAM_EXT)) entries.push({ name, type: "file" });
    }
    entries.sort((a, b) => (a.type === b.type ? (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) : a.type === "folder" ? -1 : 1));
    const truncated = entries.length > BROWSE_LIMIT;
    const listing: BrowseListing = { path: dir, entries: truncated ? entries.slice(0, BROWSE_LIMIT) : entries };
    if (truncated) listing.truncated = true;
    return listing;
  }

  createFolder(path: string, name: string): string {
    if (!allowedName(name, false)) throw new StorageError("invalid-path", "name is not allowed");
    const dir = absolutePath(path);
    if (!withinHome(this.#home, dir)) throw new StorageError("refused", "path is outside the home directory");
    if (this.#catalogFile(dir)) throw new StorageError("invalid-path", "path is not a folder");
    const node = this.#catalog.get(dir);
    if (!node) throw new StorageError("not-found", "not found");
    if (nameTaken([...node.folders, ...node.files], name, "")) throw new StorageError("conflict", "name exists");
    node.folders.add(name);
    this.#catalog.set(joinPath(dir, name), { folders: new Set(), files: new Set() });
    return joinPath(dir, name);
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

  #lib(): Place {
    if (this.#library === "") throw new StorageError("not-found", "not found");
    const place = this.#places.get(this.#library);
    if (!place) throw new StorageError("not-found", "not found");
    return place;
  }

  #stamp(): string {
    return this.#now().toISOString();
  }

  #projectNames(): string[] {
    const names = new Set<string>(this.#lib().folders.keys());
    for (const path of this.#lib().files.keys()) {
      const slash = path.indexOf("/");
      if (slash > 0) names.add(path.slice(0, slash));
    }
    return [...names];
  }

  #childNames(project: string): string[] {
    return this.#projectFiles(project).filter((name) => !name.includes("/"));
  }

  #projectFiles(project: string): string[] {
    const prefix = `${project}/`;
    const names: string[] = [];
    for (const path of this.#lib().files.keys()) {
      if (path.startsWith(prefix)) names.push(path.slice(prefix.length));
    }
    return names;
  }

  #projectFolder(name: string): string {
    const existing = matchName(this.#projectNames(), name);
    if (!existing) throw new StorageError("not-found", "not found");
    return existing;
  }

  #addProject(name: string): void {
    this.#lib().folders.set(name, this.#stamp());
    this.#places.set(`${this.#library}/${name}`, makePlace({}, [], this.#now));
  }

  #draftsFolder(): string {
    return matchName(this.#projectNames(), "Drafts") ?? this.createProject("Drafts");
  }

  #nextDraft(names: readonly string[]): string {
    if (!nameTaken(names, `Untitled${DIAGRAM_EXT}`, "")) return `Untitled${DIAGRAM_EXT}`;
    for (let n = 2; n <= 10000; n++) {
      const file = `Untitled ${String(n)}${DIAGRAM_EXT}`;
      if (!nameTaken(names, file, "")) return file;
    }
    throw new StorageError("conflict", "name exists");
  }

  #renameProject(from: string, to: string): string {
    if (!allowedName(to, false)) throw new StorageError("invalid-path", "name is not allowed");
    const source = matchName(this.#projectNames(), from);
    if (!source) throw new StorageError("not-found", "not found");
    if (nameTaken(this.#projectNames(), to, source)) throw new StorageError("conflict", "name exists");
    if (source !== to) this.#rekeyProject(source, to);
    return to;
  }

  #rekeyProject(from: string, to: string): void {
    const lib = this.#lib();
    const prefix = `${from}/`;
    const moved: [string, Entry][] = [];
    for (const [path, entry] of lib.files) {
      if (!path.startsWith(prefix)) continue;
      moved.push([`${to}/${path.slice(prefix.length)}`, entry]);
      lib.files.delete(path);
    }
    for (const [path, entry] of moved) lib.files.set(path, entry);
    const modified = lib.folders.get(from);
    if (modified !== undefined) {
      lib.folders.delete(from);
      lib.folders.set(to, modified);
    }
    const oldAbs = `${this.#library}/${from}`;
    const nextAbs = `${this.#library}/${to}`;
    const place = this.#places.get(oldAbs);
    if (place) {
      this.#places.delete(oldAbs);
      this.#places.set(nextAbs, place);
    }
    if (this.#path === oldAbs) this.#path = nextAbs;
  }

  #renameDiagram(project: string, file: string, to: string): string {
    if (!allowedName(to, true)) throw new StorageError("invalid-path", "name is not allowed");
    const folder = this.#projectFolder(project);
    const source = matchName(this.#childNames(folder), file);
    if (!source) throw new StorageError("not-found", "not found");
    const dest = `${to}${DIAGRAM_EXT}`;
    if (nameTaken(this.#childNames(folder), dest, source)) throw new StorageError("conflict", "name exists");
    if (source !== dest) this.#moveLibraryFile(`${folder}/${source}`, `${folder}/${dest}`);
    return `${folder}/${dest}`;
  }

  #deletable(rel: string): boolean {
    if (!rel.includes("/")) return true;
    const slash = rel.indexOf("/");
    const file = rel.slice(slash + 1);
    return rel.slice(0, slash) !== "" && !file.includes("/") && file.endsWith(DIAGRAM_EXT);
  }

  #libraryHas(rel: string): boolean {
    if (!rel.includes("/")) return matchName(this.#projectNames(), rel) === rel;
    return this.#lib().files.has(rel);
  }

  #trashMove(rel: string): void {
    if (this.#trashMode === "missing") throw new TrashMissing();
    this.#erase(rel);
  }

  #erase(rel: string): void {
    const lib = this.#lib();
    if (!rel.includes("/")) {
      const prefix = `${rel}/`;
      for (const path of [...lib.files.keys()]) {
        if (path.startsWith(prefix)) lib.files.delete(path);
      }
      lib.folders.delete(rel);
      this.#places.delete(`${this.#library}/${rel}`);
      return;
    }
    lib.files.delete(rel);
    this.#mirror(rel, (place, rest) => {
      place.files.delete(rest);
    });
  }

  #copyProject(dir: string): string {
    const intoAssets = dir.endsWith("/assets");
    const name = intoAssets ? dir.slice(0, -"/assets".length) : dir;
    if (name === "" || name.includes("/") || (intoAssets && dir !== `${name}/assets`)) {
      throw new StorageError("invalid-path", "name is not allowed");
    }
    return this.#projectFolder(name);
  }

  #ensureAssets(project: string): void {
    const place = this.#places.get(`${this.#library}/${project}`);
    if (place && !place.folders.has("assets")) place.folders.set("assets", this.#stamp());
  }

  #writeLibrary(rel: string, data: Uint8Array): void {
    const entry = { data: data.slice(), modified: this.#stamp() };
    this.#lib().files.set(rel, entry);
    this.#mirror(rel, (place, rest) => {
      place.files.set(rest, { data: data.slice(), modified: entry.modified });
    });
  }

  #moveLibraryFile(from: string, to: string): void {
    const entry = this.#lib().files.get(from);
    if (!entry) throw new StorageError("not-found", "not found");
    this.#lib().files.delete(from);
    this.#lib().files.set(to, entry);
    this.#mirror(from, (place, rest) => {
      place.files.delete(rest);
    });
    this.#mirror(to, (place, rest) => {
      place.files.set(rest, { data: entry.data.slice(), modified: entry.modified });
    });
  }

  #mirror(rel: string, write: (place: Place, rest: string) => void): void {
    const slash = rel.indexOf("/");
    if (slash < 0) return;
    const place = this.#places.get(`${this.#library}/${rel.slice(0, slash)}`);
    if (place) write(place, rel.slice(slash + 1));
  }

  #catalogFile(path: string): boolean {
    const slash = path.lastIndexOf("/");
    const dir = slash <= 0 ? "/" : path.slice(0, slash);
    const name = path.slice(slash + 1);
    return this.#catalog.get(dir)?.files.has(name) ?? false;
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

  createProject(name: string): Promise<string> {
    return this.#call(() => this.#volume.createProject(name));
  }

  createDraft(): Promise<string> {
    return this.#call(() => this.#volume.createDraft());
  }

  createDiagram(project: string, name: string): Promise<string> {
    return this.#call(() => this.#volume.createDiagram(project, name));
  }

  renameItem(from: string, to: string): Promise<string> {
    return this.#call(() => this.#volume.renameItem(from, to));
  }

  deleteItem(path: string, noTrash?: boolean): Promise<string> {
    return this.#call(() => this.#volume.deleteItem(path, noTrash));
  }

  copyFile(from: string, dir: string): Promise<string> {
    return this.#call(() => this.#volume.copyFile(from, dir));
  }

  importFiles(project: string, files: readonly ImportedFile[]): Promise<string[]> {
    return this.#call(() => this.#volume.importFiles(project, files));
  }

  readLibrary(path: string): Promise<Uint8Array> {
    return this.#call(() => this.#volume.readLibrary(path));
  }

  replaceLibrary(path: string, data: Uint8Array): Promise<void> {
    return this.#call(() => {
      this.#volume.replaceLibrary(path, data);
    });
  }

  browse(path?: string): Promise<BrowseListing> {
    return this.#call(() => this.#volume.browse(path));
  }

  createFolder(path: string, name: string): Promise<string> {
    return this.#call(() => this.#volume.createFolder(path, name));
  }

  #call<T>(fn: () => T): Promise<T> {
    try {
      this.#gate();
      return Promise.resolve(fn());
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
