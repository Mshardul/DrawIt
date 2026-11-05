import { describe, expect, it } from "vitest";
import type { Preferences } from "../storage/adapter.ts";
import { autosaveOn, createAutosave, type AutosaveClock } from "./autosave.ts";

interface Clock extends AutosaveClock {
  advance(ms: number): Promise<void>;
}

function clock(): Clock {
  let now = 0;
  let next = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    setTimeout(fn, ms) {
      const id = next;
      next += 1;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id as number);
    },
    async advance(ms) {
      now += ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= now).sort((a, b) => a[1].at - b[1].at);
        const first = due[0];
        if (!first) return;
        timers.delete(first[0]);
        first[1].fn();
        await Promise.resolve();
      }
    },
  };
}

describe("autosave preference", () => {
  it("is on for a library project and off for an opened folder until chosen", () => {
    expect(autosaveOn({}, "library")).toBe(true);
    expect(autosaveOn({}, "project")).toBe(true);
    expect(autosaveOn({}, "opened")).toBe(false);
    expect(autosaveOn({}, "")).toBe(false);
  });

  it("reads the library and an opened folder from their own keys", () => {
    const preferences: Preferences = { autosave: { library: false, opened: true } };
    expect(autosaveOn(preferences, "library")).toBe(false);
    expect(autosaveOn(preferences, "project")).toBe(false);
    expect(autosaveOn(preferences, "opened")).toBe(true);
  });

  it("keeps the default when a stored value is not a boolean", () => {
    const preferences: Preferences = { autosave: { library: "no", opened: 1 } };
    expect(autosaveOn(preferences, "project")).toBe(true);
    expect(autosaveOn(preferences, "opened")).toBe(false);
  });
});

describe("autosave", () => {
  it("writes two seconds after the last edit", async () => {
    const time = clock();
    let writes = 0;
    const auto = createAutosave({
      clock: time,
      enabled: () => true,
      dirty: () => true,
      save: () => {
        writes += 1;
        return Promise.resolve();
      },
    });
    auto.edited();
    await time.advance(1999);
    expect(writes).toBe(0);
    auto.edited();
    await time.advance(1999);
    expect(writes).toBe(0);
    await time.advance(1);
    expect(writes).toBe(1);
    await time.advance(5000);
    expect(writes).toBe(1);
  });

  it("does not write when autosave is off or the file is clean", async () => {
    const time = clock();
    let writes = 0;
    let enabled = false;
    let dirty = true;
    const auto = createAutosave({
      clock: time,
      enabled: () => enabled,
      dirty: () => dirty,
      save: () => {
        writes += 1;
        return Promise.resolve();
      },
    });
    auto.edited();
    await time.advance(2000);
    expect(writes).toBe(0);
    enabled = true;
    dirty = false;
    auto.edited();
    await time.advance(2000);
    expect(writes).toBe(0);
  });

  it("uses the preference at the moment the delay ends", async () => {
    const time = clock();
    let enabled = false;
    let writes = 0;
    const auto = createAutosave({
      clock: time,
      enabled: () => enabled,
      dirty: () => true,
      save: () => {
        writes += 1;
        return Promise.resolve();
      },
    });
    auto.edited();
    enabled = true;
    await time.advance(2000);
    expect(writes).toBe(1);
  });

  it("writes one file at a time", async () => {
    let current = 0;
    let peak = 0;
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const auto = createAutosave({
      enabled: () => true,
      dirty: () => true,
      save: async () => {
        current += 1;
        peak = Math.max(peak, current);
        await held;
        current -= 1;
      },
    });
    const first = auto.saveNow();
    const second = auto.saveNow();
    await Promise.resolve();
    expect(current).toBe(1);
    expect(peak).toBe(1);
    release();
    await first;
    await second;
    expect(current).toBe(0);
    expect(peak).toBe(1);
  });

  it("a save now drops the pending autosave", async () => {
    const time = clock();
    let writes = 0;
    const auto = createAutosave({
      clock: time,
      enabled: () => true,
      dirty: () => writes === 0,
      save: () => {
        writes += 1;
        return Promise.resolve();
      },
    });
    auto.edited();
    await auto.saveNow();
    expect(writes).toBe(1);
    await time.advance(2000);
    expect(writes).toBe(1);
  });

  it("stop drops a pending autosave", async () => {
    const time = clock();
    let writes = 0;
    const auto = createAutosave({
      clock: time,
      enabled: () => true,
      dirty: () => true,
      save: () => {
        writes += 1;
        return Promise.resolve();
      },
    });
    auto.edited();
    auto.stop();
    await time.advance(5000);
    expect(writes).toBe(0);
  });

  it("a failed save does not block the next one", async () => {
    let calls = 0;
    const auto = createAutosave({
      enabled: () => true,
      dirty: () => true,
      save: () => {
        calls += 1;
        if (calls === 1) return Promise.reject(new Error("disk"));
        return Promise.resolve();
      },
    });
    await expect(auto.saveNow()).rejects.toThrow("disk");
    await auto.saveNow();
    expect(calls).toBe(2);
  });
});
