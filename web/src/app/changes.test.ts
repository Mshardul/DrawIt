import { describe, expect, it } from "vitest";
import { readText, writeText } from "../storage/adapter.ts";
import { MemoryStorage } from "../storage/memory.ts";
import { monoMeasurer } from "../testing/measurer.ts";
import { replaceFromDisk, watchChanges } from "./changes.ts";
import { FileChanged, openFile } from "./workspace.ts";

const canonical = `diagram version=1

node a "A" shape=rect
node b "B" shape=ellipse

layout {
  a x=0 y=0 w=100 h=50
  b x=200 y=0
}
`;

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

async function opened(source = canonical, visible: () => boolean = () => true) {
  let time = Date.parse("2026-11-05T00:00:00.000Z");
  const storage = new MemoryStorage({ "d.drawit.kdl": source }, { now: () => new Date(time) });
  const result = await openFile(storage, "d.drawit.kdl", monoMeasurer);
  if (!result.ok) throw new Error("expected the file to open");
  let stats = 0;
  let reads = 0;
  const stat = storage.stat.bind(storage);
  const read = storage.read.bind(storage);
  storage.stat = (path) => {
    stats += 1;
    return stat(path);
  };
  storage.read = (path) => {
    reads += 1;
    return read(path);
  };
  const clock = manualClock();
  let reloads = 0;
  const stop = watchChanges(result.file, storage, {
    measurer: monoMeasurer,
    clock,
    visible,
    onReload: () => {
      reloads += 1;
    },
  });
  await Promise.resolve();
  return {
    storage,
    file: result.file,
    clock,
    stop,
    stats: () => stats,
    reads: () => reads,
    reloads: () => reloads,
    bump: () => {
      time += 1000;
    },
  };
}

function label(file: { document: { elements: { id: string; kind: string; label?: string }[] } }): string | undefined {
  const element = file.document.elements.find((item) => item.id === "a");
  return element?.kind === "node" ? element.label : undefined;
}

describe("open file polling", () => {
  it("checks the file about once a second and does not read it while the stat is unchanged", async () => {
    const ctx = await opened();
    expect(ctx.clock.ms()).toBe(1000);
    expect(ctx.reads()).toBe(0);
    const stats = ctx.stats();
    await ctx.clock.fire();
    expect(ctx.stats()).toBe(stats + 1);
    expect(ctx.reads()).toBe(0);
    expect(ctx.reloads()).toBe(0);
  });

  it("does not stat the file while the page is hidden", async () => {
    const ctx = await opened();
    const stats = ctx.stats();
    ctx.stop();
    const hidden = manualClock();
    const stop = watchChanges(ctx.file, ctx.storage, { measurer: monoMeasurer, clock: hidden, visible: () => false });
    await Promise.resolve();
    const afterArm = ctx.stats();
    await hidden.fire();
    expect(ctx.stats()).toBe(afterArm);
    expect(ctx.reads()).toBe(0);
    stop();
    expect(afterArm).toBeGreaterThanOrEqual(stats);
  });

  it("stops checking after unsubscribe", async () => {
    const ctx = await opened();
    const stats = ctx.stats();
    ctx.stop();
    await ctx.clock.fire();
    expect(ctx.stats()).toBe(stats);
    expect(ctx.reads()).toBe(0);
  });

  it("reloads an outside change of the same size as one undo step and leaves the file clean", async () => {
    const ctx = await opened();
    ctx.file.history.selection = ["a"];
    ctx.bump();
    await writeText(ctx.storage, "d.drawit.kdl", canonical.replace('node a "A"', 'node a "Z"'));
    await ctx.clock.fire();
    expect(label(ctx.file)).toBe("Z");
    expect(ctx.file.dirty).toBe(false);
    expect(ctx.file.history.selection).toEqual([]);
    expect(ctx.file.history.canUndo).toBe(true);
    expect(ctx.reloads()).toBe(1);
    expect(ctx.file.history.undo()).toBe(true);
    expect(label(ctx.file)).toBe("A");
    expect(ctx.file.history.selection).toEqual(["a"]);
    expect(ctx.file.dirty).toBe(true);
  });

  it("places a reloaded document that has no layout and stays clean", async () => {
    const ctx = await opened();
    ctx.bump();
    await writeText(ctx.storage, "d.drawit.kdl", "diagram version=1\n\nnode a shape=rect\nnode b shape=rect\n");
    await ctx.clock.fire();
    expect(ctx.file.document.layout).toEqual([
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 240, y: 0 },
    ]);
    expect(ctx.file.dirty).toBe(false);
    expect(ctx.reloads()).toBe(1);
  });

  it("ignores a time change when the bytes are unchanged", async () => {
    const ctx = await opened();
    ctx.bump();
    await writeText(ctx.storage, "d.drawit.kdl", canonical);
    await ctx.clock.fire();
    expect(ctx.reads()).toBe(1);
    expect(ctx.reloads()).toBe(0);
    expect(ctx.file.history.canUndo).toBe(false);
    expect(label(ctx.file)).toBe("A");
  });

  it("does not reload the app's own save", async () => {
    const ctx = await opened();
    ctx.file.history.execute({ type: "setElement", id: "a", set: { label: "Saved" } });
    ctx.bump();
    await ctx.file.save(ctx.storage);
    await ctx.clock.fire();
    expect(label(ctx.file)).toBe("Saved");
    expect(ctx.file.dirty).toBe(false);
    expect(ctx.file.history.canUndo).toBe(true);
    expect(ctx.reloads()).toBe(0);
    expect(ctx.file.history.undo()).toBe(true);
    expect(label(ctx.file)).toBe("A");
  });

  it("does not reload an outside change while the file has unsaved edits", async () => {
    const ctx = await opened();
    ctx.file.history.execute({ type: "setElement", id: "a", set: { label: "Mine" } });
    ctx.bump();
    await writeText(ctx.storage, "d.drawit.kdl", canonical.replace('node a "A"', 'node a "Z"'));
    await ctx.clock.fire();
    expect(label(ctx.file)).toBe("Mine");
    expect(ctx.file.dirty).toBe(true);
    expect(ctx.reloads()).toBe(0);
    expect(ctx.file.history.undo()).toBe(true);
    expect(label(ctx.file)).toBe("A");
  });

  it("reports an outside change while there are unsaved edits and still treats those bytes as foreign", async () => {
    const ctx = await opened();
    const hash = ctx.file.diskHash();
    ctx.stop();
    let reported = "";
    const clock = manualClock();
    const stop = watchChanges(ctx.file, ctx.storage, {
      measurer: monoMeasurer,
      clock,
      onConflict: (text) => {
        reported = text;
      },
    });
    await Promise.resolve();
    ctx.file.history.execute({ type: "setElement", id: "a", set: { label: "Mine" } });
    ctx.bump();
    const outside = canonical.replace('node a "A"', 'node a "Z"');
    await writeText(ctx.storage, "d.drawit.kdl", outside);
    await clock.fire();
    expect(reported).toBe(outside);
    expect(label(ctx.file)).toBe("Mine");
    expect(ctx.file.diskHash()).toBe(hash);
    await expect(ctx.file.save(ctx.storage)).rejects.toBeInstanceOf(FileChanged);
    expect(await readText(ctx.storage, "d.drawit.kdl")).toBe(outside);
    stop();
  });

  it("reloads the given text as one undo step and refuses text that is not a diagram", async () => {
    const ctx = await opened();
    ctx.stop();
    ctx.file.history.execute({ type: "setElement", id: "a", set: { label: "Mine" } });
    const outside = canonical.replace('node a "A"', 'node a "Z"');
    expect(replaceFromDisk(ctx.file, "diagram {\n", monoMeasurer)).toMatch(/line \d+, column \d+/);
    expect(label(ctx.file)).toBe("Mine");
    expect(ctx.file.history.canUndo).toBe(true);
    expect(replaceFromDisk(ctx.file, outside, monoMeasurer)).toBeNull();
    expect(label(ctx.file)).toBe("Z");
    expect(ctx.file.dirty).toBe(false);
    expect(ctx.file.history.undo()).toBe(true);
    expect(label(ctx.file)).toBe("Mine");
    expect(ctx.file.dirty).toBe(true);
  });

  it("does not replace the document when the outside file is invalid", async () => {
    const ctx = await opened();
    ctx.bump();
    await writeText(ctx.storage, "d.drawit.kdl", "diagram {\n");
    await ctx.clock.fire();
    expect(label(ctx.file)).toBe("A");
    expect(ctx.file.history.canUndo).toBe(false);
    expect(ctx.reloads()).toBe(0);
    expect(ctx.file.dirty).toBe(false);
  });
});
