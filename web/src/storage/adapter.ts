// The one interface the app uses to reach the local server. File calls use the open workspace; library calls read and write the library folder. Files are bytes.

/** A file in the workspace, as `GET /api/files` reports it. */
export interface FileInfo {
  /** Slash-separated path relative to the workspace folder, with no `.` or `..` segments. */
  path: string;
  size: number;
  /** UTC time of the last change, ISO 8601 as `Date.toISOString` writes it. */
  modified: string;
}

/** The largest file a write may hold, in bytes, whatever the file is. The server refuses a larger one. */
export const MAX_FILE_BYTES = 32 * 1024 * 1024;

export type WatchEvent =
  | { type: "created" | "changed" | "removed"; path: string };

export type Unsubscribe = () => void;

export type StorageErrorCode =
  /** No such file (HTTP 404). */
  | "not-found"
  /** The path is not a file path inside the folder, or names a folder where a file is needed (HTTP 400). */
  | "invalid-path"
  /** The storage refused access (HTTP 403). */
  | "refused"
  /** A write is larger than `MAX_FILE_BYTES` (HTTP 413). */
  | "too-large"
  /** This tab no longer holds the server session (HTTP 401). */
  | "session-lost"
  /** Another tab holds the session (HTTP 409). */
  | "open-elsewhere"
  /** The workspace id is stale, or preferences cannot be written (HTTP 409). */
  | "conflict";

export type WorkspaceKind = "library" | "project" | "opened" | "";

export interface WorkspaceInfo {
  id: string;
  kind: WorkspaceKind;
  path: string;
}

export type WorkspaceTarget = { library: true } | { project: string } | { folder: string } | { file: string };

export interface TopFile {
  path: string;
  type: "file";
  size: number;
  modified: string;
}

export interface TopFolder {
  path: string;
  type: "folder";
  modified: string;
  diagrams: number;
  latest?: { path: string; modified: string };
}

export type TopEntry = TopFile | TopFolder;

export interface TopListing {
  revision: string;
  entries: TopEntry[];
}

export type Preferences = Record<string, unknown>;

export interface BrowseEntry {
  name: string;
  type: "folder" | "file";
}

export interface BrowseListing {
  path: string;
  entries: BrowseEntry[];
  truncated?: boolean;
}

export interface ImportedFile {
  path: string;
  data: Uint8Array;
}

/** Throws `too-large` if `data` cannot be written as the file at `path`. */
export function assertFitsLimit(path: string, data: Uint8Array): void {
  if (data.length > MAX_FILE_BYTES) {
    throw new StorageError("too-large", `${path} is ${String(data.length)} bytes, over the limit of ${String(MAX_FILE_BYTES)}`);
  }
}

export class StorageError extends Error {
  readonly code: StorageErrorCode;

  constructor(code: StorageErrorCode, message: string) {
    super(message);
    this.name = "StorageError";
    this.code = code;
  }
}

export interface StorageAdapter {
  /** Every regular file in the workspace, in the order the server lists them. */
  list(): Promise<FileInfo[]>;
  /** Rejects with `StorageError` `not-found` or `invalid-path`. */
  read(path: string): Promise<Uint8Array>;
  /**
   * Replaces the file, creating it and its folders if needed. Atomic: a reader sees the old
   * bytes or the new, never a mix. Rejects with `StorageError` `invalid-path` for a folder and
   * `too-large` for more than `MAX_FILE_BYTES`, changing nothing.
   */
  write(path: string, data: Uint8Array): Promise<void>;
  /** Calls `listener` for changes, including this adapter's own writes, which the app tells apart by content hash. `path` is polled about once a second while visible; content is read only when the time or size changed, and a matching hash is not reported. */
  watch(listener: (event: WatchEvent) => void, path?: string): Unsubscribe;
  /** The workspace the server is serving now. */
  currentWorkspace(): Promise<WorkspaceInfo>;
  /** Switches the served folder. A failed open leaves the current workspace in place. */
  openWorkspace(target: WorkspaceTarget): Promise<WorkspaceInfo>;
  /** The top level of the workspace: files, folders and each folder's latest diagram. */
  listTop(): Promise<TopListing>;
  /** Size and modified time of one file. */
  stat(path: string): Promise<FileInfo>;
  /** Claims the one server session for this tab, or refreshes it when this tab already holds it. */
  claimSession(): Promise<string>;
  /** Takes the session over from whichever tab holds it. */
  takeoverSession(): Promise<string>;
  readPreferences(): Promise<Preferences>;
  /** Merges each namespace's keys. A bad patch changes nothing. */
  patchPreferences(patch: Record<string, Record<string, unknown>>): Promise<Preferences>;
  /** Creates a project folder. The name is the path. */
  createProject(name: string): Promise<string>;
  /** Creates the next empty draft, `Untitled` then `Untitled 2`, in `Drafts`. */
  createDraft(): Promise<string>;
  /** Creates an empty diagram in a project. `name` has no extension. */
  createDiagram(project: string, name: string): Promise<string>;
  /** Renames a project, or a diagram when `from` is `project/file.drawit.kdl`. `to` has no extension. */
  renameItem(from: string, to: string): Promise<string>;
  /** Deletes a project or a diagram. With no trash this refuses unless `noTrash` is set. */
  deleteItem(path: string, noTrash?: boolean): Promise<string>;
  /** Copies a library file into `dir` (`project` or `project/assets`) under a name that is free. */
  copyFile(from: string, dir: string): Promise<string>;
  /** Writes files into a project. A relative path that exists becomes `name 2`, then `name 3`. */
  importFiles(project: string, files: readonly ImportedFile[]): Promise<string[]>;
  /** Bytes of one library file, whichever folder is open. */
  readLibrary(path: string): Promise<Uint8Array>;
  /** Replaces a library file that already exists. */
  replaceLibrary(path: string, data: Uint8Array): Promise<void>;
  /** Folders and `.drawit.kdl` files under the home directory. No path lists the home directory. */
  browse(path?: string): Promise<BrowseListing>;
  /** Creates a folder in a directory the browser can list. Returns its absolute path. */
  createFolder(path: string, name: string): Promise<string>;
}

export async function readText(storage: StorageAdapter, path: string): Promise<string> {
  return new TextDecoder().decode(await storage.read(path));
}

export function writeText(storage: StorageAdapter, path: string, text: string): Promise<void> {
  return storage.write(path, new TextEncoder().encode(text));
}
