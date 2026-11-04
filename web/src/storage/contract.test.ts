import { describe, expect, it } from "vitest";
import type { StorageAdapter } from "./adapter.ts";
import { StorageError } from "./adapter.ts";
import { HttpStorage } from "./http.ts";
import { MemoryVolume, type MemoryVolumeOptions } from "./memory.ts";

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

function memoryTabs(): { holder: StorageAdapter; other: StorageAdapter } {
  const volume = new MemoryVolume(fixture());
  return { holder: volume.tab(), other: volume.tab() };
}

function httpTabs(): { holder: StorageAdapter; other: StorageAdapter } {
  const fetch = serve(new MemoryVolume(fixture()));
  const tab = () => new HttpStorage({ token: "tok", session: "", fetch });
  return { holder: tab(), other: tab() };
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
      return Promise.resolve(plain(404, "not found"));
    } catch (error) {
      if (error instanceof StorageError) return Promise.resolve(plain(statusOf(error.code), error.message));
      return Promise.resolve(plain(500, error instanceof Error ? error.message : "error"));
    }
  };
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
