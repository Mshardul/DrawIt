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

export interface AutosaveSettings {
  library: boolean;
  opened: boolean;
}

export const DEFAULT_AUTOSAVE: AutosaveSettings = { library: true, opened: false };

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

/** The autosave entry in the preferences file. Missing fields use the defaults. */
export function readAutosave(value: unknown): AutosaveSettings {
  const record = asRecord(value);
  return {
    library: typeof record["library"] === "boolean" ? record["library"] : DEFAULT_AUTOSAVE.library,
    opened: typeof record["opened"] === "boolean" ? record["opened"] : DEFAULT_AUTOSAVE.opened,
  };
}

/** A project is a library folder, so it uses the library key. */
export function autosaveOn(preferences: Preferences, kind: WorkspaceKind): boolean {
  const settings = readAutosave(preferences["autosave"]);
  if (kind === "library" || kind === "project") return settings.library;
  return kind === "opened" && settings.opened;
}

/** Autosave on/off as Preferences edits them. */
export interface SavingPrefs {
  autosave(): AutosaveSettings;
  setAutosave(change: Partial<AutosaveSettings>): void;
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
