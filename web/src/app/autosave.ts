import type { Preferences, WorkspaceKind } from "../storage/adapter.ts";

/** How long after the last edit an autosave waits. */
export const AUTOSAVE_DELAY = 2000;

export interface AutosaveClock {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

const browserClock: AutosaveClock = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => {
    clearTimeout(id as ReturnType<typeof setTimeout>);
  },
};

/** A project is a library folder, so it uses the library key. An absent key is on for the library and off for an opened folder. */
export function autosaveOn(preferences: Preferences, kind: WorkspaceKind): boolean {
  const stored = preferences["autosave"];
  const record = typeof stored === "object" && stored !== null ? (stored as Record<string, unknown>) : {};
  const library = typeof record["library"] === "boolean" ? record["library"] : true;
  const opened = typeof record["opened"] === "boolean" ? record["opened"] : false;
  if (kind === "library" || kind === "project") return library;
  return kind === "opened" && opened;
}

export interface Autosave {
  /** A save is due one delay after the latest call, when autosave is on and the file is dirty. */
  edited(): void;
  /** Writes now and drops a pending autosave. Saves run one at a time. */
  saveNow(): Promise<void>;
  /** Drops a pending autosave. A save already underway still finishes. */
  stop(): void;
}

export function createAutosave(options: {
  enabled: () => boolean;
  dirty: () => boolean;
  save: () => Promise<void>;
  delay?: number;
  clock?: AutosaveClock;
}): Autosave {
  const delay = options.delay ?? AUTOSAVE_DELAY;
  const clock = options.clock ?? browserClock;
  let timer: unknown = null;
  let chain = Promise.resolve();

  const clear = (): void => {
    if (timer === null) return;
    clock.clearTimeout(timer);
    timer = null;
  };

  const enqueue = (run: () => Promise<void>): Promise<void> => {
    const done = chain.then(run, run);
    chain = done.then(
      () => undefined,
      () => undefined,
    );
    return done;
  };

  return {
    edited() {
      clear();
      timer = clock.setTimeout(() => {
        timer = null;
        void enqueue(async () => {
          if (!options.enabled() || !options.dirty()) return;
          await options.save();
        });
      }, delay);
    },
    saveNow() {
      clear();
      return enqueue(() => options.save());
    },
    stop() {
      clear();
    },
  };
}
