import { describe, expect, it } from "vitest";
import { StorageError, type Preferences, type StorageErrorCode } from "../storage/adapter.ts";
import { MemoryStorage } from "../storage/memory.ts";
import { preferenceStore } from "./preference-store.ts";

/** An in-memory preferences file whose writes can be made to fail. */
function disk() {
  const storage = new MemoryStorage({});
  const state: { fail: Error | null } = { fail: null };
  return {
    state,
    file: () => storage.readPreferences(),
    store: preferenceStore({
      readPreferences: () => storage.readPreferences(),
      patchPreferences: (patch) => (state.fail ? Promise.reject(state.fail) : storage.patchPreferences(patch)),
    }),
  };
}

const refusal = (code: StorageErrorCode): StorageError => new StorageError(code, code);

describe("preference store", () => {
  it("writes a change to the file", async () => {
    const { store, file } = disk();
    await store.patch({ grid: { show: true } });
    expect(await file()).toMatchObject({ grid: { show: true } });
    expect(store.unsaved).toBe(false);
  });

  it.each([new Error("HTTP 500"), refusal("conflict")])("keeps a change in memory when the write fails: %s", async (error) => {
    const { store, state, file } = disk();
    await store.patch({ grid: { show: true, size: 8 } });
    state.fail = error;
    await store.patch({ grid: { show: false } });
    expect(store.unsaved).toBe(true);
    expect(await store.read()).toMatchObject({ grid: { show: false, size: 8 } });
    expect(await file()).toMatchObject({ grid: { show: true } });
  });

  it("applies a later change over the earlier one in memory", async () => {
    const { store, state } = disk();
    state.fail = new Error("HTTP 500");
    await store.patch({ grid: { show: false } });
    await store.patch({ grid: { show: true }, panels: { library: 200 } });
    expect(await store.read()).toMatchObject({ grid: { show: true }, panels: { library: 200 } });
  });

  it("writes the held changes once the file can be written again", async () => {
    const { store, state, file } = disk();
    state.fail = new Error("HTTP 500");
    await store.patch({ grid: { show: false } });
    state.fail = null;
    await store.patch({ panels: { library: 200 } });
    expect(await file()).toMatchObject({ grid: { show: false }, panels: { library: 200 } });
    expect(store.unsaved).toBe(false);
  });

  it("shows a change to a read made before the write finishes", async () => {
    const { store } = disk();
    const written = store.patch({ grid: { show: false } });
    expect(await store.read()).toMatchObject({ grid: { show: false } });
    await written;
  });

  it("keeps the newer value when two writes overlap", async () => {
    const { store, file } = disk();
    await Promise.all([store.patch({ grid: { size: 8 } }), store.patch({ grid: { size: 16 } })]);
    expect(await file()).toMatchObject({ grid: { size: 16 } });
    expect(await store.read()).toMatchObject({ grid: { size: 16 } });
  });

  it("tells watchers when saving starts and stops failing", async () => {
    const { store, state } = disk();
    const seen: boolean[] = [];
    const stop = store.watch(() => seen.push(store.unsaved));
    state.fail = new Error("HTTP 500");
    await store.patch({ grid: { show: false } });
    await store.patch({ grid: { show: true } });
    state.fail = null;
    await store.patch({ grid: { show: false } });
    stop();
    state.fail = new Error("HTTP 500");
    await store.patch({ grid: { show: true } });
    expect(seen).toEqual([true, false]);
  });

  it.each(["session-lost", "open-elsewhere", "invalid-path"] as const)("passes on %s, which is not a failed write", async (code) => {
    const { store, state } = disk();
    state.fail = refusal(code);
    await expect(store.patch({ grid: { show: false } })).rejects.toMatchObject({ code });
    expect(store.unsaved).toBe(false);
  });

  it("reads what it last knew when the file cannot be read", async () => {
    let broken = false;
    const store = preferenceStore({
      readPreferences: (): Promise<Preferences> => (broken ? Promise.reject(new Error("HTTP 500")) : Promise.resolve({ version: 1, grid: { size: 8 } })),
      patchPreferences: () => Promise.reject(new Error("HTTP 500")),
    });
    await store.read();
    await store.patch({ grid: { show: false } });
    broken = true;
    expect(await store.read()).toEqual({ version: 1, grid: { size: 8, show: false } });
  });
});
