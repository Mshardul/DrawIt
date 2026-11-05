import { describe, expect, it } from "vitest";
import type { StorageAdapter } from "./adapter.ts";
import { MAX_FILE_BYTES, StorageError } from "./adapter.ts";
import { HttpStorage } from "./http.ts";
import { MemoryVolume, type MemoryVolumeOptions } from "./memory.ts";

interface LibraryBody {
  project?: string;
  diagram?: string;
  draft?: boolean;
  from?: string;
  to?: string;
  delete?: string;
  noTrash?: boolean;
  copy?: string;
  into?: string;
}

function fixture(): MemoryVolumeOptions {
  let time = Date.parse("2026-11-05T00:00:00.000Z");
  return {
    path: "/work",
    library: "/DrawIt",
    now: () => new Date(time++),
    files: {
      "readme.txt": "hello",
      "Demo/a.drawit.kdl": "old",
      "Demo/b.drawit.kdl": "new",
      "Demo/assets/c.drawit.kdl": "nested",
      "Demo/notes.txt": "note",
    },
    folders: ["Empty"],
    places: {
      "/DrawIt": { files: { "Demo/a.drawit.kdl": "a" } },
      "/DrawIt/Demo": { files: { "a.drawit.kdl": "a" } },
      "/other": { files: { "b.drawit.kdl": "b" } },
    },
  };
}

function memoryTabs(options?: MemoryVolumeOptions): { holder: StorageAdapter; other: StorageAdapter; volume: MemoryVolume } {
  const volume = new MemoryVolume(options ?? fixture());
  return { holder: volume.tab(), other: volume.tab(), volume };
}

function httpTabs(options?: MemoryVolumeOptions): { holder: StorageAdapter; other: StorageAdapter; volume: MemoryVolume } {
  const volume = new MemoryVolume(options ?? fixture());
  const fetch = serve(volume);
  const tab = () => new HttpStorage({ token: "tok", session: "", fetch });
  return { holder: tab(), other: tab(), volume };
}

function homeFixture(): MemoryVolumeOptions {
  const folders = Array.from({ length: 501 }, (_, index) => `f${String(index).padStart(3, "0")}`);
  return {
    path: "/work",
    library: "/home/DrawIt",
    places: { "/home/DrawIt": { files: { "Demo/a.drawit.kdl": "a" } } },
    catalog: {
      "/home": { folders: ["DrawIt", "docs", ".git", ...folders], files: ["readme.txt", "loose.drawit.kdl"] },
      "/home/docs": { folders: ["Sub"], files: ["pitch.drawit.kdl", "pic.png", ".hidden.drawit.kdl"] },
      "/etc": { folders: ["passwd"], files: [] },
    },
  };
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    return error instanceof StorageError ? error.code : "other";
  }
  return undefined;
}

describe.each([
  ["memory", memoryTabs],
  ["http", httpTabs],
] as const)("%s storage adapter", (_name, open) => {
  it("reports the open workspace, then a top-level listing and a file stat", async () => {
    const { holder } = open();
    await holder.claimSession();
    const workspace = await holder.currentWorkspace();
    expect(workspace.id).not.toBe("");
    expect(workspace).toMatchObject({ kind: "opened", path: "/work" });

    const top = await holder.listTop();
    expect(top.revision).not.toBe("");
    expect(top.entries.map((entry) => entry.path)).toEqual(["Demo", "Empty", "readme.txt"]);
    const demo = top.entries[0];
    const empty = top.entries[1];
    const readme = top.entries[2];
    if (demo?.type !== "folder" || empty?.type !== "folder" || readme?.type !== "file") {
      throw new Error(`entries ${JSON.stringify(top.entries)}`);
    }
    expect(demo.diagrams).toBe(2);
    expect(demo.latest).toMatchObject({ path: "Demo/b.drawit.kdl" });
    expect(empty.diagrams).toBe(0);
    expect(empty.latest).toBeUndefined();
    expect(readme).toMatchObject({ size: 5 });
    expect(JSON.stringify(top)).not.toContain("c.drawit.kdl");

    const stat = await holder.stat("readme.txt");
    expect(stat).toMatchObject({ path: "readme.txt", size: 5, modified: readme.modified });
    expect(await codeOf(holder.stat("missing.drawit.kdl"))).toBe("not-found");

    await holder.write("readme.txt", new TextEncoder().encode("hello!"));
    const again = await holder.listTop();
    expect(again.revision).not.toBe(top.revision);
    expect(await holder.stat("readme.txt")).toMatchObject({ size: 6 });
  });

  it("opens the library, a project, a folder or a file, and keeps the previous workspace when the open fails", async () => {
    const { holder } = open();
    await holder.claimSession();
    const first = await holder.currentWorkspace();

    const library = await holder.openWorkspace({ library: true });
    expect(library.id).not.toBe(first.id);
    expect(library).toMatchObject({ kind: "library", path: "/DrawIt" });

    const project = await holder.openWorkspace({ project: "Demo" });
    expect(project).toMatchObject({ kind: "project", path: "/DrawIt/Demo" });
    expect((await holder.list()).map((file) => file.path)).toEqual(["a.drawit.kdl"]);

    const folder = await holder.openWorkspace({ folder: "/other" });
    expect(folder).toMatchObject({ kind: "opened", path: "/other" });
    const file = await holder.openWorkspace({ file: "/other/b.drawit.kdl" });
    expect(file).toMatchObject({ kind: "opened", path: "/other" });

    expect(await codeOf(holder.openWorkspace({ folder: "/missing" }))).toBe("not-found");
    expect(await codeOf(holder.openWorkspace({ project: "../outside" }))).toBe("invalid-path");
    expect(await holder.currentWorkspace()).toMatchObject({ id: file.id, path: "/other" });
  });

  it("reads and patches preferences without dropping other keys", async () => {
    const { holder } = open();
    await holder.claimSession();
    expect(await holder.readPreferences()).toEqual({ version: 1 });

    expect(await holder.patchPreferences({ editor: { grid: true } })).toEqual({ version: 1, editor: { grid: true } });
    expect(await holder.patchPreferences({ editor: { snap: false }, panels: { library: 224 } })).toEqual({
      version: 1,
      editor: { grid: true, snap: false },
      panels: { library: 224 },
    });
    expect(await holder.readPreferences()).toEqual({
      version: 1,
      editor: { grid: true, snap: false },
      panels: { library: 224 },
    });
    expect(await codeOf(holder.patchPreferences({ version: { n: 2 } }))).toBe("invalid-path");
    expect(await holder.readPreferences()).toMatchObject({ editor: { grid: true } });
  });

  it("gives one session to the holder and lets the other tab take it over", async () => {
    const { holder, other } = open();
    const id = await holder.claimSession();
    expect(await holder.claimSession()).toBe(id);
    await holder.currentWorkspace();
    expect((await holder.list()).length).toBeGreaterThan(0);

    expect(await codeOf(other.claimSession())).toBe("open-elsewhere");
    await expect(other.list()).rejects.toMatchObject({ name: "StorageError", code: "session-lost" });

    const taken = await other.takeoverSession();
    expect(taken).not.toBe(id);
    await other.currentWorkspace();
    expect((await other.list()).length).toBeGreaterThan(0);
    await expect(holder.list()).rejects.toMatchObject({ code: "session-lost" });
    expect(await codeOf(holder.claimSession())).toBe("open-elsewhere");
  });

  it("creates a project, the next draft and a named diagram in the library", async () => {
    const { holder } = open();
    await holder.claimSession();

    expect(await holder.createProject("Home network")).toBe("Home network");
    expect(await holder.createDraft()).toBe("Drafts/Untitled.drawit.kdl");
    expect(await holder.createDraft()).toBe("Drafts/Untitled 2.drawit.kdl");
    expect(new TextDecoder().decode(await holder.readLibrary("Drafts/Untitled.drawit.kdl"))).toBe("diagram version=1\n");
    expect(await holder.createDiagram("Home network", "Notes")).toBe("Home network/Notes.drawit.kdl");

    const library = await holder.openWorkspace({ library: true });
    expect(library).toMatchObject({ kind: "library", path: "/DrawIt" });
    const names = (await holder.listTop()).entries.map((entry) => entry.path);
    expect(names).toContain("Home network");
    expect(names).toContain("Drafts");

    const project = await holder.openWorkspace({ project: "Home network" });
    expect(project).toMatchObject({ kind: "project", path: "/DrawIt/Home network" });
    expect((await holder.list()).map((file) => file.path)).toEqual(["Notes.drawit.kdl"]);
  });

  it("refuses a project name that exists ignoring case, and a name the library does not allow", async () => {
    const { holder } = open();
    await holder.claimSession();
    expect(await codeOf(holder.createProject("demo"))).toBe("conflict");
    expect(await codeOf(holder.createProject("CON"))).toBe("invalid-path");
    expect(await codeOf(holder.createDiagram("Demo", "a"))).toBe("conflict");
    expect(new TextDecoder().decode(await holder.readLibrary("Demo/a.drawit.kdl"))).toBe("a");
  });

  it("renames a project or a diagram, and a change of case alone is not a clash", async () => {
    const { holder } = open();
    await holder.claimSession();
    expect(await holder.renameItem("Demo", "demo")).toBe("demo");
    expect(await holder.renameItem("demo/a.drawit.kdl", "A")).toBe("demo/A.drawit.kdl");
    await holder.createDiagram("demo", "Notes");
    expect(await codeOf(holder.renameItem("demo/A.drawit.kdl", "Notes"))).toBe("conflict");
    expect(new TextDecoder().decode(await holder.readLibrary("demo/A.drawit.kdl"))).toBe("a");
    const project = await holder.openWorkspace({ project: "demo" });
    expect(project.path).toBe("/DrawIt/demo");
    expect((await holder.list()).map((file) => file.path).sort()).toEqual(["A.drawit.kdl", "Notes.drawit.kdl"]);
  });

  it("keeps a delete when there is no trash, and removes it once that is confirmed", async () => {
    const { holder, volume } = open();
    await holder.claimSession();
    volume.useTrash("missing");
    expect(await codeOf(holder.deleteItem("Demo"))).toBe("conflict");
    expect(new TextDecoder().decode(await holder.readLibrary("Demo/a.drawit.kdl"))).toBe("a");
    expect(await holder.deleteItem("Demo", true)).toBe("Demo");
    expect(await codeOf(holder.readLibrary("Demo/a.drawit.kdl"))).toBe("not-found");
    expect(await codeOf(holder.openWorkspace({ project: "Demo" }))).toBe("not-found");
  });

  it("removes one diagram and leaves the rest of its project", async () => {
    const { holder } = open();
    await holder.claimSession();
    await holder.createDiagram("Demo", "Notes");
    expect(await holder.deleteItem("Demo/a.drawit.kdl")).toBe("Demo/a.drawit.kdl");
    expect(await codeOf(holder.readLibrary("Demo/a.drawit.kdl"))).toBe("not-found");
    expect(new TextDecoder().decode(await holder.readLibrary("Demo/Notes.drawit.kdl"))).toBe("diagram version=1\n");
  });

  it("copies a library file under a free name, creating assets when the copy goes there", async () => {
    const { holder } = open();
    await holder.claimSession();
    await holder.importFiles("Demo", [{ path: "assets/logo.png", data: Uint8Array.of(1, 2, 3) }]);
    await holder.createProject("Other");
    expect(await holder.copyFile("Demo/a.drawit.kdl", "Other")).toBe("Other/a.drawit.kdl");
    expect(await holder.copyFile("Demo/a.drawit.kdl", "Other")).toBe("Other/a 2.drawit.kdl");
    expect(new TextDecoder().decode(await holder.readLibrary("Other/a.drawit.kdl"))).toBe("a");
    expect(await holder.copyFile("Demo/assets/logo.png", "Other/assets")).toBe("Other/assets/logo.png");
    expect(await holder.readLibrary("Other/assets/logo.png")).toEqual(Uint8Array.of(1, 2, 3));
    expect(await holder.copyFile("Demo/assets/logo.png", "Other/assets")).toBe("Other/assets/logo 2.png");
  });

  it("imports a list of files into a project and renames a clash by adding 2, then 3", async () => {
    const { holder } = open();
    await holder.claimSession();
    const first = new TextEncoder().encode("one");
    const second = new TextEncoder().encode("two");
    expect(
      await holder.importFiles("Demo", [
        { path: "a.drawit.kdl", data: first },
        { path: "a.drawit.kdl", data: second },
        { path: "assets/logo.png", data: Uint8Array.of(4) },
      ]),
    ).toEqual(["Demo/a 2.drawit.kdl", "Demo/a 3.drawit.kdl", "Demo/assets/logo.png"]);
    expect(new TextDecoder().decode(await holder.readLibrary("Demo/a.drawit.kdl"))).toBe("a");
    expect(new TextDecoder().decode(await holder.readLibrary("Demo/a 2.drawit.kdl"))).toBe("one");
    expect(new TextDecoder().decode(await holder.readLibrary("Demo/a 3.drawit.kdl"))).toBe("two");
    expect(await codeOf(holder.importFiles("Demo", [{ path: "../out.drawit.kdl", data: first }]))).toBe("invalid-path");
    expect(await codeOf(holder.importFiles("Demo", [{ path: "assets/nested/logo.png", data: first }]))).toBe("invalid-path");
    expect(new TextDecoder().decode(await holder.readLibrary("Demo/a.drawit.kdl"))).toBe("a");
    const big = new Uint8Array(MAX_FILE_BYTES + 1);
    expect(await codeOf(holder.importFiles("Demo", [{ path: "big.bin", data: big }]))).toBe("too-large");
    expect(await codeOf(holder.readLibrary("Demo/big.bin"))).toBe("not-found");
  });

  it("lists the home directory for the folder browser and creates a folder there", async () => {
    const { holder } = open(homeFixture());
    await holder.claimSession();
    const home = await holder.browse();
    expect(home.path).toBe("/home");
    expect(home.truncated).toBe(true);
    expect(home.entries).toHaveLength(500);
    expect(home.entries[0]).toEqual({ name: "DrawIt", type: "folder" });
    expect(home.entries[1]).toEqual({ name: "docs", type: "folder" });
    expect(home.entries.every((entry) => entry.type === "folder")).toBe(true);
    expect(home.entries.some((entry) => entry.name.startsWith("."))).toBe(false);
    expect(home.entries.some((entry) => entry.name === "readme.txt")).toBe(false);

    const docs = await holder.browse("/home/docs");
    expect(docs.truncated).toBeUndefined();
    expect(docs.entries).toEqual([
      { name: "Sub", type: "folder" },
      { name: "pitch.drawit.kdl", type: "file" },
    ]);
    expect(await codeOf(holder.browse("/etc"))).toBe("refused");
    expect(await codeOf(holder.browse("/home/docs/pitch.drawit.kdl"))).toBe("invalid-path");
    expect(await holder.createFolder("/home/docs", "Notes")).toBe("/home/docs/Notes");
    expect((await holder.browse("/home/docs")).entries.map((entry) => entry.name)).toContain("Notes");
    expect(await codeOf(holder.createFolder("/home/docs", "notes"))).toBe("conflict");
    expect(await codeOf(holder.createFolder("/etc", "Notes"))).toBe("refused");
    expect(await codeOf(holder.createFolder("/home/docs", "bad/name"))).toBe("invalid-path");
  });
});

function serve(volume: MemoryVolume): typeof fetch {
  return (input, init) => {
    const url = new URL(typeof input === "string" ? input : "", "http://drawit.local");
    const session = new Headers(init?.headers).get("X-Session-Id") ?? "";
    const method = init?.method ?? "GET";
    try {
      if (method === "POST" && url.pathname === "/api/session") {
        const takeover = typeof init?.body === "string" && init.body.includes('"takeover":true');
        return Promise.resolve(Response.json({ id: volume.claim(session, takeover) }));
      }
      volume.allow(session);
      if (method === "GET" && url.pathname === "/api/workspace") return Promise.resolve(Response.json(volume.workspace()));
      if (method === "POST" && url.pathname === "/api/workspace") {
        const target = JSON.parse(text(init)) as Parameters<MemoryVolume["open"]>[0];
        return Promise.resolve(Response.json(volume.open(target)));
      }
      if (method === "GET" && url.pathname === "/api/preferences") return Promise.resolve(Response.json(volume.readPreferences()));
      if (method === "PATCH" && url.pathname === "/api/preferences") {
        return Promise.resolve(Response.json(volume.patchPreferences(JSON.parse(text(init)) as Record<string, Record<string, unknown>>)));
      }
      if (url.pathname === "/api/files" || url.pathname === "/api/file") {
        if ((new Headers(init?.headers).get("X-Workspace-Id") ?? "") !== volume.workspace().id) {
          return Promise.resolve(plain(409, "workspace is stale"));
        }
      }
      if (method === "GET" && url.pathname === "/api/files" && url.searchParams.get("top") === "1") {
        return Promise.resolve(Response.json(volume.listTop()));
      }
      if (method === "GET" && url.pathname === "/api/files") return Promise.resolve(Response.json({ files: volume.list() }));
      if (method === "GET" && url.pathname === "/api/file" && url.searchParams.get("stat") === "1") {
        return Promise.resolve(Response.json(volume.stat(url.searchParams.get("path") ?? "")));
      }
      if (method === "GET" && url.pathname === "/api/file") {
        return Promise.resolve(new Response(buffer(volume.read(url.searchParams.get("path") ?? ""))));
      }
      if (method === "PUT" && url.pathname === "/api/file") {
        const body = init?.body;
        const data = body instanceof Uint8Array ? body : new Uint8Array();
        volume.write(url.searchParams.get("path") ?? "", data);
        return Promise.resolve(Response.json(volume.stat(url.searchParams.get("path") ?? "")));
      }
      if (method === "POST" && url.pathname === "/api/library") {
        return Promise.resolve(Response.json({ path: volume.changeLibrary(JSON.parse(text(init)) as LibraryBody) }));
      }
      if (method === "POST" && url.pathname === "/api/library/import") {
        const body = JSON.parse(text(init)) as { project: string; files: { path: string; data: string }[] };
        const files = body.files.map((file) => ({ path: file.path, data: bytesFromBase64(file.data) }));
        return Promise.resolve(Response.json({ paths: volume.importFiles(body.project, files) }));
      }
      if (method === "GET" && url.pathname === "/api/library/file") {
        return Promise.resolve(new Response(buffer(volume.readLibrary(url.searchParams.get("path") ?? ""))));
      }
      if (method === "PUT" && url.pathname === "/api/library/file") {
        const data = init?.body instanceof Uint8Array ? init.body : new Uint8Array();
        volume.replaceLibrary(url.searchParams.get("path") ?? "", data);
        return Promise.resolve(Response.json({ path: url.searchParams.get("path") ?? "" }));
      }
      if (method === "GET" && url.pathname === "/api/browse") {
        return Promise.resolve(Response.json(volume.browse(url.searchParams.get("path") ?? "")));
      }
      if (method === "POST" && url.pathname === "/api/browse") {
        const body = JSON.parse(text(init)) as { path: string; name: string };
        return Promise.resolve(Response.json({ path: volume.createFolder(body.path, body.name) }));
      }
      return Promise.resolve(plain(404, "not found"));
    } catch (error) {
      if (error instanceof StorageError) return Promise.resolve(plain(statusOf(error.code), error.message));
      return Promise.resolve(plain(500, error instanceof Error ? error.message : "error"));
    }
  };
}

function bytesFromBase64(data: string): Uint8Array {
  const binary = atob(data);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function buffer(data: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(data.byteLength);
  new Uint8Array(copy).set(data);
  return copy;
}

function text(init: RequestInit | undefined): string {
  return typeof init?.body === "string" ? init.body : "";
}

function plain(status: number, message: string): Response {
  return new Response(`${message}\n`, { status });
}

function statusOf(code: string): number {
  switch (code) {
    case "not-found":
      return 404;
    case "invalid-path":
      return 400;
    case "refused":
      return 403;
    case "too-large":
      return 413;
    case "session-lost":
      return 401;
    case "open-elsewhere":
      return 409;
    case "conflict":
      return 409;
    default:
      return 500;
  }
}
