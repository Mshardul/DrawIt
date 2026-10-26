// Storage adapter (spec 6.1, decision A1): the one interface the app uses to reach files in the
// opened workspace folder. Shaped after the local server's API, which T-021 implements over HTTP:
//
//   list   GET /api/files       { files: [{ path, size, modified }] }
//   read   GET /api/file?path=  the file's bytes
//   write  PUT /api/file?path=  replaces the file's bytes atomically
//
// `watch` has no server endpoint yet.

/** A file in the workspace, as `GET /api/files` reports it. */
export interface FileInfo {
  /** Slash-separated path relative to the workspace folder, with no `.` or `..` segments. */
  path: string;
  size: number;
  /** UTC time of the last change, ISO 8601 as `Date.toISOString` writes it. */
  modified: string;
}

export type WatchEvent =
  | { type: "created" | "changed" | "removed"; path: string };

export type Unsubscribe = () => void;

export type StorageErrorCode =
  /** No such file (HTTP 404). */
  | "not-found"
  /** The path is not a file path inside the folder, or names a folder where a file is needed (HTTP 400). */
  | "invalid-path"
  /** The storage refused access (HTTP 403). */
  | "refused";

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
   * bytes or the new, never a mix. Rejects with `StorageError` `invalid-path` for a folder.
   */
  write(path: string, data: Uint8Array): Promise<void>;
  /**
   * Calls `listener` when a file changes in the workspace, including changes this adapter's
   * own `write` makes: the app tells its own saves apart by content hash (decision E3).
   * Returns the function that stops listening.
   */
  watch(listener: (event: WatchEvent) => void): Unsubscribe;
}

export async function readText(storage: StorageAdapter, path: string): Promise<string> {
  return new TextDecoder().decode(await storage.read(path));
}

export function writeText(storage: StorageAdapter, path: string, text: string): Promise<void> {
  return storage.write(path, new TextEncoder().encode(text));
}
