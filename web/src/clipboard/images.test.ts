import { describe, expect, it } from "vitest";
import { applyCommand } from "../commands/command.ts";
import type { DiagramDocument } from "../model/index.ts";
import { MemoryStorage } from "../storage/memory.ts";
import { monoMeasurer } from "../testing/measurer.ts";
import { pasteCommand } from "./paste.ts";
import { ClipboardImages, pasteImageFiles, rememberImageFiles } from "./images.ts";

const doc = (src = "assets/logo.png"): DiagramDocument => ({
  version: 1,
  plugins: [],
  elements: [{ kind: "image", id: "logo", src }],
  style: { theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} }, classes: [], overrides: [] },
  layout: [{ id: "logo", x: 10, y: 20, w: 40, h: 30 }],
});

const bytes = Uint8Array.from([1, 2, 3]);

describe("clipboard images", () => {
  it("keeps image bytes for the session, keyed by the clipboard text", async () => {
    const source = new MemoryStorage();
    await source.write("assets/logo.png", bytes);
    const memory = new ClipboardImages();
    await rememberImageFiles(memory, "diagram version=1\n", source, "net.drawit.kdl", doc());
    const target = new MemoryStorage();
    const prepared = await pasteImageFiles(memory, "diagram version=1\n", target, "other.drawit.kdl", doc());
    expect(prepared.elements[0]).toMatchObject({ kind: "image", src: "assets/logo.png" });
    expect(await target.read("assets/logo.png")).toEqual(bytes);
    const incoming = doc();
    expect(await pasteImageFiles(memory, "other text", target, "other.drawit.kdl", incoming)).toBe(incoming);
  });

  it("picks an unused name and rewrites src before the paste command", async () => {
    const source = new MemoryStorage();
    await source.write("assets/logo.png", bytes);
    const memory = new ClipboardImages();
    const text = "diagram version=1\n";
    await rememberImageFiles(memory, text, source, "net.drawit.kdl", doc());
    const target = new MemoryStorage();
    await target.write("proj/assets/logo.png", Uint8Array.from([9]));
    const prepared = await pasteImageFiles(memory, text, target, "proj/page.drawit.kdl", doc());
    expect(prepared.elements[0]).toMatchObject({ src: "assets/logo-2.png" });
    expect(await target.read("proj/assets/logo-2.png")).toEqual(bytes);
    const pasted = pasteCommand(
      { version: 1, plugins: [], elements: [], style: doc().style, layout: [] },
      prepared,
      monoMeasurer,
      { x: 0, y: 0 },
    );
    if (!pasted) throw new Error("no command");
    const after = applyCommand({ version: 1, plugins: [], elements: [], style: doc().style, layout: [] }, pasted.command).document;
    expect(after.elements[0]).toMatchObject({ kind: "image", src: "assets/logo-2.png" });
  });

  it("leaves an image with no bytes so it draws as a missing file", async () => {
    const memory = new ClipboardImages();
    memory.remember("diagram version=1\n", new Map());
    const target = new MemoryStorage();
    const prepared = await pasteImageFiles(memory, "diagram version=1\n", target, "page.drawit.kdl", doc());
    expect(prepared.elements[0]).toMatchObject({ src: "assets/logo.png" });
    expect(await target.list()).toEqual([]);
  });
});
