import { StorageError, type Preferences, type StorageAdapter } from "../storage/adapter.ts";

export type PreferencePatch = Record<string, Record<string, unknown>>;

export interface PreferenceStore {
  /** The file, with the changes that could not be written laid over it. */
  read(): Promise<Preferences>;
  /** Resolves even when the file cannot be written; the change then stays in memory. */
  patch(patch: PreferencePatch): Promise<void>;
  /** True while there are changes the file could not take. */
  readonly unsaved: boolean;
  /** Calls `listener` when `unsaved` changes. */
  watch(listener: () => void): () => void;
}

type Source = Pick<StorageAdapter, "readPreferences" | "patchPreferences">;

export function preferenceStore(storage: Source): PreferenceStore {
  let known: Preferences = {};
  let pending: PreferencePatch = {};
  let unsaved = false;
  let queue: Promise<void> = Promise.resolve();
  const listeners = new Set<() => void>();
  const mark = (value: boolean): void => {
    if (unsaved === value) return;
    unsaved = value;
    for (const listener of listeners) listener();
  };
  const flush = async (): Promise<void> => {
    const sent = pending;
    if (Object.keys(sent).length === 0) return;
    try {
      known = await storage.patchPreferences(sent);
    } catch (error) {
      if (!isWriteFailure(error)) throw error;
      mark(true);
      return;
    }
    pending = without(pending, sent);
    mark(false);
  };
  return {
    async read() {
      try {
        known = await storage.readPreferences();
      } catch (error) {
        if (!isWriteFailure(error)) throw error;
      }
      return merge(known, pending);
    },
    patch(patch) {
      pending = merge(pending, patch) as PreferencePatch;
      const done = queue.then(flush);
      queue = done.catch(() => {});
      return done;
    },
    get unsaved() {
      return unsaved;
    },
    watch(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

// A lost session or a malformed patch says nothing about whether the file can be written.
function isWriteFailure(error: unknown): boolean {
  return !(error instanceof StorageError) || !["session-lost", "open-elsewhere", "invalid-path"].includes(error.code);
}

/** Merges each namespace's keys, the way the preferences file is patched. */
function merge(base: Preferences, patch: PreferencePatch): Preferences {
  const next: Preferences = { ...base };
  for (const [name, keys] of Object.entries(patch)) next[name] = { ...(next[name] as Record<string, unknown> | undefined), ...keys };
  return next;
}

/** `pending` less the values in `sent`, keeping any that changed while they were being written. */
function without(pending: PreferencePatch, sent: PreferencePatch): PreferencePatch {
  const left: PreferencePatch = {};
  for (const [name, keys] of Object.entries(pending)) {
    const rest = Object.entries(keys).filter(([key, value]) => sent[name]?.[key] !== value);
    if (rest.length > 0) left[name] = Object.fromEntries(rest);
  }
  return left;
}
