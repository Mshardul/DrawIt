import { describe, expect, it } from "vitest";
import { StorageError, readText, writeText } from "./adapter.ts";
import type { StorageAdapter, WatchEvent } from "./adapter.ts";
import { MemoryStorage } from "./memory.ts";

const bytes = (...n: number[]): Uint8Array => Uint8Array.from(n);
const paths = async (s: StorageAdapter): Promise<string[]> => (await s.list()).map((f) => f.path);

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    return error instanceof StorageError ? error.code : "other";
  }
  return undefined;
}

function events(s: StorageAdapter): WatchEvent[] {
  const seen: WatchEvent[] = [];
  s.watch((e) => seen.push(e));
  return seen;
}

describe("in-memory storage adapter", () => {
  it("[T-010] lists nothing in an empty workspace", async () => {
    expect(await new MemoryStorage().list()).toEqual([]);
  });

  it("[T-010] reads back what was written", async () => {
    const s = new MemoryStorage();
    await s.write("a.drawit.kdl", bytes(1, 2, 3));
    expect(await s.read("a.drawit.kdl")).toEqual(bytes(1, 2, 3));
  });

  it("[T-010] starts with the files it is given, text or bytes", async () => {
    const s = new MemoryStorage({ "a.kdl": "héllo", "assets/x.png": bytes(9) });
    expect(await readText(s, "a.kdl")).toBe("héllo");
    expect(await s.read("assets/x.png")).toEqual(bytes(9));
  });

  it("[T-010] lists path, size and modified time as the server does", async () => {
    const s = new MemoryStorage({}, { now: () => new Date("2026-10-26T12:00:00Z") });
    await writeText(s, "a.kdl", "héllo");
    expect(await s.list()).toEqual([{ path: "a.kdl", size: 6, modified: "2026-10-26T12:00:00.000Z" }]);
  });

  it("[T-010] lists regular files only, in the server's walk order", async () => {
    const s = new MemoryStorage({ "b.kdl": "", "a.txt": "", "a/z.kdl": "", "a/b/c.kdl": "", "a/b.kdl": "" });
    expect(await paths(s)).toEqual(["a/b/c.kdl", "a/b.kdl", "a/z.kdl", "a.txt", "b.kdl"]);
  });

  it("[T-010] a write replaces the file and updates size and modified time", async () => {
    let now = new Date("2026-10-26T12:00:00Z");
    const s = new MemoryStorage({}, { now: () => now });
    await s.write("a.kdl", bytes(1, 2, 3));
    now = new Date("2026-10-26T12:05:00Z");
    await s.write("a.kdl", bytes(7));
    expect(await s.read("a.kdl")).toEqual(bytes(7));
    expect(await s.list()).toEqual([{ path: "a.kdl", size: 1, modified: "2026-10-26T12:05:00.000Z" }]);
  });

  it("[T-010] a write creates the folders it needs", async () => {
    const s = new MemoryStorage();
    await s.write("assets/img/logo.svg", bytes(1));
    expect(await paths(s)).toEqual(["assets/img/logo.svg"]);
  });

  it("[T-010] reading a missing file fails with not-found", async () => {
    expect(await codeOf(new MemoryStorage().read("nope.kdl"))).toBe("not-found");
  });

  it("[T-010] paths are cleaned the way the server cleans them", async () => {
    const s = new MemoryStorage();
    await s.write("./a//b/../c.kdl", bytes(1));
    expect(await paths(s)).toEqual(["a/c.kdl"]);
    expect(await s.read("a/./c.kdl")).toEqual(bytes(1));
  });

  it.each(["", ".", "/etc/passwd", "../x", "a/../../x", "a/..", "a\0b"])("[T-010] refuses the path %j", async (path) => {
    const s = new MemoryStorage();
    expect(await codeOf(s.read(path))).toBe("invalid-path");
    expect(await codeOf(s.write(path, bytes(1)))).toBe("invalid-path");
    expect(await s.list()).toEqual([]);
  });

  it("[T-010] a folder is not a file: it cannot be read or written over, and a file is not a folder", async () => {
    const s = new MemoryStorage({ "a/b.kdl": "x", "f.kdl": "x" });
    expect(await codeOf(s.read("a"))).toBe("invalid-path");
    expect(await codeOf(s.write("a", bytes(1)))).toBe("invalid-path");
    expect(await codeOf(s.write("f.kdl/inner.kdl", bytes(1)))).toBe("invalid-path");
    expect(await paths(s)).toEqual(["a/b.kdl", "f.kdl"]);
  });

  it("[T-010] stored bytes are copies: changing a buffer afterwards changes nothing", async () => {
    const s = new MemoryStorage();
    const data = bytes(1, 2);
    await s.write("a", data);
    data[0] = 99;
    const read = await s.read("a");
    read[1] = 99;
    expect(await s.read("a")).toEqual(bytes(1, 2));
  });

  it("[T-010] text helpers round-trip UTF-8", async () => {
    const s = new MemoryStorage();
    await writeText(s, "a.kdl", "node ✓ \"é\"\n");
    expect(await readText(s, "a.kdl")).toBe("node ✓ \"é\"\n");
  });

  it("[T-010] watch reports created, changed and removed files", async () => {
    const s = new MemoryStorage();
    const seen = events(s);
    await s.write("a/b.kdl", bytes(1));
    await s.write("a/b.kdl", bytes(2));
    s.remove("a/b.kdl");
    expect(seen).toEqual([
      { type: "created", path: "a/b.kdl" },
      { type: "changed", path: "a/b.kdl" },
      { type: "removed", path: "a/b.kdl" },
    ]);
    expect(await s.list()).toEqual([]);
  });

  it("[T-010] watch reports the cleaned path", async () => {
    const s = new MemoryStorage();
    const seen = events(s);
    await s.write("./a//b.kdl", bytes(1));
    expect(seen).toEqual([{ type: "created", path: "a/b.kdl" }]);
  });

  it("[T-010] watch reaches every listener until it unsubscribes", async () => {
    const s = new MemoryStorage();
    const first: WatchEvent[] = [];
    const second: WatchEvent[] = [];
    const stop = s.watch((e) => first.push(e));
    s.watch((e) => second.push(e));
    await s.write("a", bytes(1));
    stop();
    await s.write("b", bytes(1));
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(2);
  });

  it("[T-010] a refused write reports no event", async () => {
    const s = new MemoryStorage({ "a/b": "x" });
    const seen = events(s);
    await codeOf(s.write("a", bytes(1)));
    expect(seen).toEqual([]);
  });

  it("[T-010] removing a file that does not exist fails with not-found", () => {
    expect(() => {
      new MemoryStorage().remove("nope");
    }).toThrow(StorageError);
  });
});
