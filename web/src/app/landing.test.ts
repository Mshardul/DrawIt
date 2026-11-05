import { describe, expect, it } from "vitest";
import type { FileInfo, Preferences } from "../storage/adapter.ts";
import { MemoryStorage } from "../storage/memory.ts";
import { landingModel, listingSignature, recordOpened, reviseRecent, watchListing } from "./landing.ts";

const now = new Date(2026, 10, 5, 15);

function at(day: number, hour = 9): string {
  return new Date(2026, 10, day, hour).toISOString();
}

function file(path: string, day: number): FileInfo {
  return { path, size: path.length, modified: at(day) };
}

function manualClock() {
  let n = 0;
  let scheduled = 0;
  const timers = new Map<number, () => void | Promise<void>>();
  return {
    ms: () => scheduled,
    setInterval(fn: () => void | Promise<void>, ms: number) {
      scheduled = ms;
      n += 1;
      timers.set(n, fn);
      return n;
    },
    clearInterval(id: unknown) {
      if (typeof id === "number") timers.delete(id);
    },
    fire() {
      return Promise.all([...timers.values()].map((fn) => Promise.resolve(fn())));
    },
  };
}

describe("landing page", () => {
  it("lists only the top-level diagrams, with the folder's name", () => {
    const model = landingModel(
      [
        file("notes.txt", 5),
        file("sub/hidden.drawit.kdl", 5),
        file("b.drawit.kdl", 4),
        file("a.drawit.kdl", 5),
      ],
      {},
      { kind: "project", path: "/DrawIt/Demo" },
      now,
    );
    expect(model).toMatchObject({
      title: "Demo",
      tag: "",
      folderPath: "",
      recentTitle: "Recent",
      diagrams: [
        { path: "a.drawit.kdl", name: "a", when: "Today" },
        { path: "b.drawit.kdl", name: "b", when: "Yesterday" },
      ],
      recent: [],
    });
  });

  it("names an opened folder and shows the recent diagrams of that folder", () => {
    const model = landingModel(
      [file("architecture.drawit.kdl", 5), file("deploy.drawit.kdl", 4)],
      { recent: { "/work/docs": ["gone.drawit.kdl", "deploy.drawit.kdl", "notes.txt"], "/DrawIt": ["Demo/a.drawit.kdl"] } },
      { kind: "opened", path: "/work/docs" },
      now,
    );
    expect(model).toMatchObject({
      title: "docs",
      tag: "Opened folder",
      folderPath: "/work/docs",
      recentTitle: "Recent in this folder",
      recent: [{ path: "deploy.drawit.kdl", name: "deploy", when: "Yesterday" }],
    });
  });

  it("uses Files when the folder has no name", () => {
    expect(landingModel([], {}, { kind: "opened", path: "" }, now).title).toBe("Files");
  });
});

describe("recent files", () => {
  it("records an opened project diagram under the project and under the library", () => {
    const patch = recordOpened({ recent: { "/DrawIt/Notes": ["keep.drawit.kdl"] } }, { kind: "project", path: "/DrawIt/Demo" }, "network.drawit.kdl");
    expect(patch).toEqual({
      recent: {
        "/DrawIt/Demo": ["network.drawit.kdl"],
        "/DrawIt": ["Demo/network.drawit.kdl"],
      },
    });
  });

  it("records a library open under the library and under the project", () => {
    expect(recordOpened({}, { kind: "library", path: "/DrawIt" }, "Demo/network.drawit.kdl")).toEqual({
      recent: {
        "/DrawIt": ["Demo/network.drawit.kdl"],
        "/DrawIt/Demo": ["network.drawit.kdl"],
      },
    });
  });

  it("records an opened folder only under that folder, and moves a repeat to the front", () => {
    const prefs: Preferences = { recent: { "/work": ["b.drawit.kdl", "a.drawit.kdl"], "/DrawIt": ["Demo/a.drawit.kdl"] } };
    expect(recordOpened(prefs, { kind: "opened", path: "/work" }, "a.drawit.kdl")).toEqual({
      recent: { "/work": ["a.drawit.kdl", "b.drawit.kdl"] },
    });
    expect(recordOpened(prefs, { kind: "opened", path: "/work" }, "notes.txt")).toEqual({});
  });

  it("keeps the twelve most recent", () => {
    const existing = Array.from({ length: 12 }, (_, i) => `f${String(i)}.drawit.kdl`);
    const patch = recordOpened({ recent: { "/work": existing } }, { kind: "opened", path: "/work" }, "new.drawit.kdl");
    const list = (patch.recent as Record<string, string[]>)["/work"] ?? [];
    expect(list).toHaveLength(12);
    expect(list[0]).toBe("new.drawit.kdl");
    expect(list).not.toContain("f11.drawit.kdl");
  });

  it("renames a diagram in the folder list and the library list", () => {
    const prefs: Preferences = {
      recent: {
        "/DrawIt": ["Demo/a.drawit.kdl", "Notes/b.drawit.kdl"],
        "/DrawIt/Demo": ["a.drawit.kdl", "old.drawit.kdl"],
      },
    };
    expect(reviseRecent(prefs, { type: "rename-file", folder: "/DrawIt/Demo", from: "a.drawit.kdl", to: "A.drawit.kdl" })).toEqual({
      recent: {
        "/DrawIt": ["Demo/A.drawit.kdl", "Notes/b.drawit.kdl"],
        "/DrawIt/Demo": ["A.drawit.kdl", "old.drawit.kdl"],
      },
    });
  });

  it("renames a project in its key and in the library paths", () => {
    const prefs: Preferences = {
      recent: {
        "/DrawIt": ["Demo/a.drawit.kdl", "Notes/b.drawit.kdl"],
        "/DrawIt/Demo": ["a.drawit.kdl"],
      },
    };
    expect(reviseRecent(prefs, { type: "rename-project", library: "/DrawIt", from: "Demo", to: "Home" })).toEqual({
      recent: {
        "/DrawIt": ["Home/a.drawit.kdl", "Notes/b.drawit.kdl"],
        "/DrawIt/Demo": [],
        "/DrawIt/Home": ["a.drawit.kdl"],
      },
    });
  });

  it("drops a deleted diagram and a deleted project", () => {
    const prefs: Preferences = {
      recent: {
        "/DrawIt": ["Demo/a.drawit.kdl", "Notes/b.drawit.kdl"],
        "/DrawIt/Demo": ["a.drawit.kdl", "old.drawit.kdl"],
      },
    };
    expect(reviseRecent(prefs, { type: "delete-file", folder: "/DrawIt/Demo", file: "a.drawit.kdl" })).toEqual({
      recent: {
        "/DrawIt": ["Notes/b.drawit.kdl"],
        "/DrawIt/Demo": ["old.drawit.kdl"],
      },
    });
    expect(reviseRecent(prefs, { type: "delete-project", library: "/DrawIt", project: "Demo" })).toEqual({
      recent: {
        "/DrawIt": ["Notes/b.drawit.kdl"],
        "/DrawIt/Demo": [],
      },
    });
  });

  it("moves a diagram to the destination project and fixes the library path in place", () => {
    const prefs: Preferences = {
      recent: {
        "/DrawIt": ["Notes/b.drawit.kdl", "Drafts/Untitled.drawit.kdl"],
        "/DrawIt/Drafts": ["Untitled.drawit.kdl"],
        "/DrawIt/Demo": ["a.drawit.kdl"],
      },
    };
    expect(reviseRecent(prefs, { type: "move", from: "Drafts/Untitled.drawit.kdl", to: "Demo/Untitled.drawit.kdl" })).toEqual({
      recent: {
        "/DrawIt": ["Notes/b.drawit.kdl", "Demo/Untitled.drawit.kdl"],
        "/DrawIt/Drafts": [],
        "/DrawIt/Demo": ["Untitled.drawit.kdl", "a.drawit.kdl"],
      },
    });
  });
});

describe("landing refresh", () => {
  it("checks about once a second and redraws only when a top-level diagram changed", async () => {
    const storage = new MemoryStorage({ "a.drawit.kdl": "diagram version=1\n", "notes.txt": "x" });
    let lists = 0;
    const list = storage.list.bind(storage);
    storage.list = () => {
      lists += 1;
      return list();
    };
    const clock = manualClock();
    let changes = 0;
    const stop = watchListing(() => storage.list(), () => { changes += 1; }, {
      clock,
      signature: listingSignature(await storage.list()),
    });
    const seen = lists;
    expect(clock.ms()).toBe(1000);

    await clock.fire();
    expect(lists).toBe(seen + 1);
    expect(changes).toBe(0);

    await storage.write("notes.txt", new TextEncoder().encode("y"));
    await clock.fire();
    expect(changes).toBe(0);

    await storage.write("b.drawit.kdl", new TextEncoder().encode("diagram version=1\n"));
    await clock.fire();
    expect(changes).toBe(1);

    stop();
    await storage.write("c.drawit.kdl", new TextEncoder().encode("diagram version=1\n"));
    await clock.fire();
    expect(changes).toBe(1);
  });

  it("does not list while the page is hidden, and a failed list leaves the page as it is", async () => {
    const storage = new MemoryStorage({ "a.drawit.kdl": "diagram version=1\n" });
    let lists = 0;
    const list = storage.list.bind(storage);
    storage.list = () => {
      lists += 1;
      return list();
    };
    const clock = manualClock();
    let changes = 0;
    watchListing(() => storage.list(), () => { changes += 1; }, {
      clock,
      visible: () => false,
      signature: listingSignature([]),
    });
    await clock.fire();
    expect(lists).toBe(0);

    storage.list = () => Promise.reject(new Error("down"));
    const again = manualClock();
    watchListing(() => storage.list(), () => { changes += 1; }, { clock: again, signature: "none" });
    await expect(again.fire()).resolves.toBeDefined();
    expect(changes).toBe(0);
  });
});
