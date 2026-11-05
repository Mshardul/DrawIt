import { describe, expect, it } from "vitest";
import { MemoryStorage } from "../storage/memory.ts";
import type { StorageAdapter } from "../storage/adapter.ts";
import { ImageStore, type ImageStoreOptions } from "./store.ts";

const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

function setup(files: Record<string, string | Uint8Array> = { "assets/logo.png": png }, overrides: Partial<ImageStoreOptions> = {}) {
  const storage = new MemoryStorage(files);
  const reads: string[] = [];
  const counting: StorageAdapter = {
    list: () => storage.list(),
    read: (path) => {
      reads.push(path);
      return storage.read(path);
    },
    write: (path, data) => storage.write(path, data),
    watch: (listener) => storage.watch(listener),
    currentWorkspace: () => storage.currentWorkspace(),
    openWorkspace: (target) => storage.openWorkspace(target),
    listTop: () => storage.listTop(),
    stat: (path) => storage.stat(path),
    claimSession: () => storage.claimSession(),
    takeoverSession: () => storage.takeoverSession(),
    readPreferences: () => storage.readPreferences(),
    patchPreferences: (patch) => storage.patchPreferences(patch),
    createProject: (name) => storage.createProject(name),
    createDraft: () => storage.createDraft(),
    createDiagram: (project, name) => storage.createDiagram(project, name),
    renameItem: (from, to) => storage.renameItem(from, to),
    deleteItem: (path, noTrash) => storage.deleteItem(path, noTrash),
    copyFile: (from, dir) => storage.copyFile(from, dir),
    importFiles: (project, files) => storage.importFiles(project, files),
    readLibrary: (path) => storage.readLibrary(path),
    replaceLibrary: (path, data) => storage.replaceLibrary(path, data),
    browse: (path) => storage.browse(path),
    createFolder: (path, name) => storage.createFolder(path, name),
  };
  const changes: number[] = [];
  const made: { blob: Blob; url: string }[] = [];
  const revoked: string[] = [];
  const store = new ImageStore({
    storage: counting,
    onChange: () => changes.push(changes.length),
    decode: () => Promise.resolve({ w: 200, h: 100 }),
    createUrl: (blob) => {
      const url = `blob:test/${String(made.length)}`;
      made.push({ blob, url });
      return url;
    },
    revokeUrl: (url) => revoked.push(url),
    ...overrides,
  });
  store.setBase("a.drawit.kdl");
  return { store, reads, changes, made, revoked };
}

const settle = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

describe("image store", () => {
  it("answers loading at first, then the blob URL and the natural size, telling the app once", async () => {
    const { store, changes, made } = setup();
    expect(store.lookup("assets/logo.png")).toEqual({ status: "loading" });
    await settle();
    expect(store.lookup("assets/logo.png")).toEqual({ status: "ready", url: "blob:test/0", w: 200, h: 100 });
    expect(changes).toHaveLength(1);
    expect(made).toHaveLength(1);
    expect(made[0]?.blob.type).toBe("image/png");
    expect(new Uint8Array(await made[0]?.blob.arrayBuffer() ?? new ArrayBuffer(0))).toEqual(png);
  });

  it("reads each file once however often it is asked", async () => {
    const { store, reads } = setup();
    store.lookup("assets/logo.png");
    store.lookup("assets/logo.png");
    await settle();
    store.lookup("assets/logo.png");
    expect(reads).toEqual(["assets/logo.png"]);
  });

  it("resolves paths against the diagram's folder", async () => {
    const { store, reads } = setup({ "sub/assets/logo.png": png });
    store.setBase("sub/a.drawit.kdl");
    store.lookup("assets/logo.png");
    await settle();
    expect(reads).toEqual(["sub/assets/logo.png"]);
    expect(store.lookup("assets/logo.png")).toMatchObject({ status: "ready" });
  });

  it("fails at once for a path that is not a workspace image, without reading", () => {
    const { store, reads } = setup();
    for (const src of ["../outside.png", "https://example.com/x.png", "assets/notes.txt"]) {
      expect(store.lookup(src), src).toEqual({ status: "failed" });
    }
    expect(reads).toEqual([]);
  });

  it("fails for a file that is missing, and tells the app", async () => {
    const { store, changes } = setup();
    expect(store.lookup("assets/gone.png")).toEqual({ status: "loading" });
    await settle();
    expect(store.lookup("assets/gone.png")).toEqual({ status: "failed" });
    expect(changes).toHaveLength(1);
  });

  it("fails for a file the browser cannot decode, and does not keep its URL", async () => {
    const { store, revoked } = setup({ "assets/bad.png": Uint8Array.from([1, 2, 3]) }, { decode: () => Promise.reject(new Error("bad image")) });
    store.lookup("assets/bad.png");
    await settle();
    expect(store.lookup("assets/bad.png")).toEqual({ status: "failed" });
    expect(revoked).toEqual(["blob:test/0"]);
  });

  it("falls back to no natural size when the image reports none", async () => {
    const { store } = setup(undefined, { decode: () => Promise.resolve({ w: 0, h: 0 }) });
    store.lookup("assets/logo.png");
    await settle();
    expect(store.lookup("assets/logo.png")).toEqual({ status: "ready", url: "blob:test/0", w: 0, h: 0 });
  });

  it("forgets everything and frees the URLs when another diagram is opened, and when disposed", async () => {
    const { store, reads, revoked } = setup();
    store.lookup("assets/logo.png");
    await settle();
    store.setBase("b.drawit.kdl");
    expect(revoked).toEqual(["blob:test/0"]);
    store.lookup("assets/logo.png");
    await settle();
    expect(reads).toHaveLength(2);
    store.dispose();
    expect(revoked).toEqual(["blob:test/0", "blob:test/1"]);
  });

  it("drops a load that finishes after another diagram was opened", async () => {
    const { store, changes, made, revoked } = setup();
    store.lookup("assets/logo.png");
    store.setBase("b.drawit.kdl");
    await settle();
    expect(changes).toEqual([]);
    expect(made.map((m) => m.url).filter((u) => !revoked.includes(u))).toEqual([]);
  });
});
