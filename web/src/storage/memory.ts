import { StorageError } from "./adapter.ts";
import type { FileInfo, StorageAdapter, Unsubscribe, WatchEvent } from "./adapter.ts";

export interface MemoryStorageOptions {
  /** Clock for `modified`; injected by tests. */
  now?: () => Date;
}

interface Entry {
  data: Uint8Array;
  modified: string;
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

/** A workspace held in memory, for tests. Behaves as the server's API does. */
export class MemoryStorage implements StorageAdapter {
  private readonly files = new Map<string, Entry>();
  private readonly listeners = new Set<(event: WatchEvent) => void>();
  private readonly now: () => Date;

  constructor(files: Record<string, string | Uint8Array> = {}, options: MemoryStorageOptions = {}) {
    this.now = options.now ?? (() => new Date());
    for (const [path, content] of Object.entries(files)) {
      this.files.set(clean(path), {
        data: typeof content === "string" ? new TextEncoder().encode(content) : content.slice(),
        modified: this.now().toISOString(),
      });
    }
  }

  list(): Promise<FileInfo[]> {
    const infos = [...this.files.entries()].map(([path, e]) => ({ path, size: e.data.length, modified: e.modified }));
    return Promise.resolve(infos.sort((a, b) => walkOrder(a.path, b.path)));
  }

  read(path: string): Promise<Uint8Array> {
    try {
      const clear = clean(path);
      const entry = this.files.get(clear);
      if (entry) return Promise.resolve(entry.data.slice());
      throw this.isFolder(clear)
        ? new StorageError("invalid-path", `${clear} is a folder`)
        : new StorageError("not-found", `No file ${clear}`);
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  write(path: string, data: Uint8Array): Promise<void> {
    try {
      const clear = clean(path);
      if (this.isFolder(clear)) throw new StorageError("invalid-path", `${clear} is a folder`);
      const segments = clear.split("/");
      for (let i = 1; i < segments.length; i++) {
        const parent = segments.slice(0, i).join("/");
        if (this.files.has(parent)) throw new StorageError("invalid-path", `${parent} is a file, not a folder`);
      }
      const existed = this.files.has(clear);
      this.files.set(clear, { data: data.slice(), modified: this.now().toISOString() });
      this.emit({ type: existed ? "changed" : "created", path: clear });
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  watch(listener: (event: WatchEvent) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Deletes a file, as a change made outside the app would. The adapter interface has no delete yet. */
  remove(path: string): void {
    const clear = clean(path);
    if (!this.files.delete(clear)) throw new StorageError("not-found", `No file ${clear}`);
    this.emit({ type: "removed", path: clear });
  }

  private isFolder(path: string): boolean {
    const prefix = `${path}/`;
    return [...this.files.keys()].some((p) => p.startsWith(prefix));
  }

  private emit(event: WatchEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
