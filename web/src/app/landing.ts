import type { FileInfo, Preferences, Unsubscribe } from "../storage/adapter.ts";
import type { PollClock } from "../storage/poll.ts";
import { editedWhen } from "./home.ts";

const DIAGRAM = ".drawit.kdl";
const LIMIT = 12;

export interface LandingCard {
  path: string;
  name: string;
  when: string;
}

export interface LandingModel {
  title: string;
  tag: string;
  folderPath: string;
  recentTitle: string;
  diagrams: LandingCard[];
  recent: LandingCard[];
}

export type RecentEdit =
  | { type: "rename-file"; folder: string; from: string; to: string }
  | { type: "rename-project"; library: string; from: string; to: string }
  | { type: "delete-file"; folder: string; file: string }
  | { type: "delete-project"; library: string; project: string }
  | { type: "move"; from: string; to: string };

type RecentPatch = Record<string, Record<string, unknown>>;

/** The folder page: top-level diagrams, and the diagrams opened most recently in this folder. */
export function landingModel(files: readonly FileInfo[], preferences: Preferences, place: { kind: string; path: string }, now: Date): LandingModel {
  const opened = place.kind === "opened" && place.path !== "";
  const modified = new Map(files.map((item) => [item.path, item.modified]));
  const diagrams = files
    .filter((item) => isTopDiagram(item.path))
    .sort(byPath)
    .map((item) => card(item.path, item.modified, now));
  const recent = (listsOf(preferences)[place.path] ?? [])
    .filter((path) => path.endsWith(DIAGRAM) && modified.has(path))
    .map((path) => card(path, modified.get(path) ?? "", now));
  return {
    title: titleOf(place.path),
    tag: opened ? "Opened folder" : "",
    folderPath: opened ? place.path : "",
    recentTitle: opened ? "Recent in this folder" : "Recent",
    diagrams,
    recent,
  };
}

/** Remembers `file` at the front of this folder's list and, for a library project, the library's list. */
export function recordOpened(preferences: Preferences, place: { kind: string; path: string }, file: string): RecentPatch {
  if (!file.endsWith(DIAGRAM) || file.includes("..") || place.path === "") return {};
  const lists = listsOf(preferences);
  const touched: Record<string, string[]> = {};
  if (place.kind === "project") {
    const slash = place.path.lastIndexOf("/");
    touched[place.path] = remember(lists[place.path], file);
    if (slash > 0) {
      const library = place.path.slice(0, slash);
      const project = place.path.slice(slash + 1);
      touched[library] = remember(lists[library], `${project}/${file}`);
    }
  } else if (place.kind === "library") {
    touched[place.path] = remember(lists[place.path], file);
    const slash = file.indexOf("/");
    if (slash > 0) {
      const folder = `${place.path}/${file.slice(0, slash)}`;
      touched[folder] = remember(lists[folder], file.slice(slash + 1));
    }
  } else {
    touched[place.path] = remember(lists[place.path], file);
  }
  return changed(lists, touched);
}

/** Fixes or drops recent entries after a rename, move or delete. */
export function reviseRecent(preferences: Preferences, edit: RecentEdit): RecentPatch {
  const lists = listsOf(preferences);
  const touched: Record<string, string[]> = {};
  if (edit.type === "rename-file") {
    const project = edit.folder.slice(edit.folder.lastIndexOf("/") + 1);
    const fromPath = `${project}/${edit.from}`;
    const toPath = `${project}/${edit.to}`;
    for (const [key, list] of Object.entries(lists)) {
      touched[key] = unique(list.map((item) => {
        if (item === fromPath) return toPath;
        if (key === edit.folder && item === edit.from) return edit.to;
        return item;
      }));
    }
  } else if (edit.type === "rename-project") {
    const oldKey = `${edit.library}/${edit.from}`;
    const newKey = `${edit.library}/${edit.to}`;
    for (const [key, list] of Object.entries(lists)) {
      if (key === oldKey) continue;
      touched[key] = unique(list.map((item) => retitle(item, edit.from, edit.to)));
    }
    touched[newKey] = lists[oldKey] ?? touched[newKey] ?? [];
    if (oldKey !== newKey) touched[oldKey] = [];
  } else if (edit.type === "delete-file") {
    const project = edit.folder.slice(edit.folder.lastIndexOf("/") + 1);
    const full = `${project}/${edit.file}`;
    for (const [key, list] of Object.entries(lists)) {
      touched[key] = list.filter((item) => item !== full && !(key === edit.folder && item === edit.file));
    }
  } else if (edit.type === "delete-project") {
    const key = `${edit.library}/${edit.project}`;
    const prefix = `${edit.project}/`;
    for (const [name, list] of Object.entries(lists)) {
      touched[name] = name === key ? [] : list.filter((item) => item !== edit.project && !item.startsWith(prefix));
    }
  } else {
    const fromSlash = edit.from.indexOf("/");
    const toSlash = edit.to.indexOf("/");
    if (fromSlash <= 0 || toSlash <= 0) return {};
    const fromProject = edit.from.slice(0, fromSlash);
    const toProject = edit.to.slice(0, toSlash);
    const fromFile = edit.from.slice(fromSlash + 1);
    const toFile = edit.to.slice(toSlash + 1);
    for (const [key, list] of Object.entries(lists)) {
      let items = list.map((item) => (item === edit.from ? edit.to : item));
      if (key.endsWith(`/${fromProject}`)) items = items.filter((item) => item !== fromFile);
      if (key.endsWith(`/${toProject}`)) items = [toFile, ...items.filter((item) => item !== toFile)];
      touched[key] = unique(items);
    }
  }
  return changed(lists, touched);
}

/** A hash of the top-level diagrams, so a listing refresh can ignore everything else. */
export function listingSignature(files: readonly FileInfo[]): string {
  let hash = 2166136261;
  for (const item of files.filter((file) => isTopDiagram(file.path)).sort(byPath)) {
    const line = `${item.path}\t${String(item.size)}\t${item.modified}\n`;
    for (let i = 0; i < line.length; i++) {
      hash ^= line.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  }
  return (hash >>> 0).toString(16);
}

const defaultClock: PollClock = {
  setInterval: (fn, ms) => setInterval(() => void fn(), ms),
  clearInterval: (id) => { clearInterval(id as ReturnType<typeof setInterval>); },
};

function shown(): boolean {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

/** Polls the file list while visible. Calls `onChange` only when a top-level diagram's time or size changed. */
export function watchListing(
  list: () => Promise<readonly FileInfo[]>,
  onChange: (files: readonly FileInfo[]) => void | Promise<void>,
  options?: { interval?: number; visible?: () => boolean; clock?: PollClock; signature?: string },
): Unsubscribe {
  const interval = options?.interval ?? 1000;
  const visible = options?.visible ?? shown;
  const clock = options?.clock ?? defaultClock;
  let signature = options?.signature;
  let stopped = false;
  const isStopped = (): boolean => stopped;
  const id = clock.setInterval(async () => {
    if (isStopped() || !visible()) return;
    try {
      const files = await list();
      if (isStopped()) return;
      const next = listingSignature(files);
      if (next === signature) return;
      await onChange(files);
      if (isStopped()) return;
      signature = next;
    } catch {
      // A failed listing leaves the page as it is.
    }
  }, interval);
  return () => {
    stopped = true;
    clock.clearInterval(id);
  };
}

function card(path: string, modified: string, now: Date): LandingCard {
  return { path, name: stem(path), when: editedWhen(modified, now) };
}

function isTopDiagram(path: string): boolean {
  return !path.includes("/") && path.endsWith(DIAGRAM);
}

function titleOf(path: string): string {
  if (path === "") return "Files";
  const name = path.slice(path.lastIndexOf("/") + 1);
  return name === "" ? "Files" : name;
}

function stem(path: string): string {
  const file = path.slice(path.lastIndexOf("/") + 1);
  return file.endsWith(DIAGRAM) ? file.slice(0, -DIAGRAM.length) : file;
}

function byPath(a: FileInfo, b: FileInfo): number {
  if (a.path < b.path) return -1;
  if (a.path > b.path) return 1;
  return 0;
}

function remember(list: readonly string[] | undefined, path: string): string[] {
  return [path, ...(list ?? []).filter((item) => item !== path)].slice(0, LIMIT);
}

function retitle(item: string, from: string, to: string): string {
  if (item === from) return to;
  const prefix = `${from}/`;
  return item.startsWith(prefix) ? `${to}/${item.slice(prefix.length)}` : item;
}

function unique(items: readonly string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    next.push(item);
  }
  return next;
}

function listsOf(preferences: Preferences): Record<string, string[]> {
  const recent = preferences["recent"];
  if (typeof recent !== "object" || recent === null || Array.isArray(recent)) return {};
  const lists: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(recent)) {
    if (!Array.isArray(value)) continue;
    lists[key] = value.filter((item): item is string => typeof item === "string");
  }
  return lists;
}

function changed(before: Record<string, string[]>, touched: Record<string, string[]>): RecentPatch {
  const recent: Record<string, unknown> = {};
  for (const [key, right] of Object.entries(touched)) {
    const left = before[key] ?? [];
    if (left.length === right.length && left.every((item, index) => item === right[index])) continue;
    recent[key] = right;
  }
  return Object.keys(recent).length === 0 ? {} : { recent };
}
