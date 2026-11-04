// The one interface the app uses to reach the local server. Files are bytes; text and images use the same calls.

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
  /**
   * Calls `listener` when a file changes in the workspace, including changes this adapter's
   * own `write` makes: the app tells its own saves apart by content hash.
   * Returns the function that stops listening.
   */
  watch(listener: (event: WatchEvent) => void): Unsubscribe;
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
}

export async function readText(storage: StorageAdapter, path: string): Promise<string> {
  return new TextDecoder().decode(await storage.read(path));
}

export function writeText(storage: StorageAdapter, path: string, text: string): Promise<void> {
  return storage.write(path, new TextEncoder().encode(text));
}
