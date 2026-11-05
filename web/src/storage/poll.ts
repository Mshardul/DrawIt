import type { StorageAdapter, Unsubscribe } from "./adapter.ts";

/** Hash of file text. Equal hashes mean the same bytes, so a save can be told from an outside edit. */
export function contentHash(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export interface PollClock {
  setInterval(fn: () => void | Promise<void>, ms: number): unknown;
  clearInterval(id: unknown): void;
}

export interface PollOptions {
  /** Defaults to one second. */
  interval?: number;
  /** When this returns false the tick does nothing. Defaults to the page being visible. */
  visible?: () => boolean;
  clock?: PollClock;
  /** Hash of bytes already known, so the file is not read until its time or size changes. */
  baselineHash?: string;
}

const defaultClock: PollClock = {
  setInterval: (fn, ms) => setInterval(() => void fn(), ms),
  clearInterval: (id) => {
    clearInterval(id as ReturnType<typeof setInterval>);
  },
};

function pageVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

/** Checks `path` while visible. Content is read only when the time or size changed, and only a new hash is reported. */
export function pollFile(
  storage: Pick<StorageAdapter, "stat" | "read">,
  path: string,
  onContent: (text: string) => void | Promise<void>,
  options: PollOptions = {},
): Unsubscribe {
  const interval = options.interval ?? 1000;
  const visible = options.visible ?? pageVisible;
  const clock = options.clock ?? defaultClock;
  let modified = "";
  let size = -1;
  let hash = options.baselineHash ?? "";
  let haveHash = options.baselineHash !== undefined;
  let stopped = false;
  let busy = false;
  // Read through a call so a stop during an await is still visible.
  const isStopped = (): boolean => stopped;

  const baseline = (async () => {
    try {
      const info = await storage.stat(path);
      if (isStopped()) return;
      modified = info.modified;
      size = info.size;
      if (haveHash) return;
      hash = contentHash(new TextDecoder().decode(await storage.read(path)));
      haveHash = true;
    } catch {
      // The next tick tries again.
    }
  })();

  const step = async (): Promise<void> => {
    if (isStopped() || !visible()) return;
    await baseline;
    if (isStopped() || !visible()) return;
    let info;
    try {
      info = await storage.stat(path);
    } catch {
      return;
    }
    if (isStopped() || (info.modified === modified && info.size === size && haveHash)) return;
    let text: string;
    try {
      text = new TextDecoder().decode(await storage.read(path));
    } catch {
      return;
    }
    if (isStopped()) return;
    const next = contentHash(text);
    const changed = haveHash && next !== hash;
    modified = info.modified;
    size = info.size;
    hash = next;
    haveHash = true;
    if (changed) await onContent(text);
  };

  const id = clock.setInterval(() => {
    if (busy || isStopped()) return;
    busy = true;
    return step().finally(() => {
      busy = false;
    });
  }, interval);

  return () => {
    stopped = true;
    clock.clearInterval(id);
  };
}
