import { describe, expect, it } from "vitest";
import { applyCommand } from "../commands/command.ts";
import type { DiagramDocument, DiagramElement } from "../model/index.ts";
import { MemoryStorage } from "../storage/memory.ts";
import { MAX_FILE_BYTES } from "../storage/adapter.ts";
import { addImage, assetFileName, fitSize, type ImageFile } from "./add.ts";

const doc = (elements: DiagramElement[] = []): DiagramDocument => ({
  version: 1,
  plugins: [],
  elements,
  style: { theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} }, classes: [], overrides: [] },
  layout: elements.map((e) => ({ id: e.id, x: 0, y: 0 })),
});

const png = (name = "logo.png", bytes = Uint8Array.from([1, 2, 3])): ImageFile => ({ name, type: "image/png", bytes });
const natural = (w: number, h: number) => () => Promise.resolve({ w, h });
const cap = { w: 1000, h: 600 };

describe("fitting an image to the canvas", () => {
  it("keeps the natural size when it fits", () => {
    expect(fitSize({ w: 300, h: 200 }, cap)).toEqual({ w: 300, h: 200 });
  });

  it("scales down to the canvas keeping the aspect, never up", () => {
    expect(fitSize({ w: 2000, h: 1000 }, cap)).toEqual({ w: 1000, h: 500 });
    expect(fitSize({ w: 1000, h: 1200 }, cap)).toEqual({ w: 500, h: 600 });
    expect(fitSize({ w: 40, h: 20 }, { w: 1000, h: 600 })).toEqual({ w: 40, h: 20 });
  });

  it("is at least one px each way, and a whole number", () => {
    expect(fitSize({ w: 5000, h: 3 }, cap)).toEqual({ w: 1000, h: 1 });
    expect(fitSize({ w: 1001, h: 333 }, cap)).toEqual({ w: 1000, h: 333 });
  });

  it("uses the natural size when the canvas has no size yet", () => {
    expect(fitSize({ w: 300, h: 200 }, { w: 0, h: 0 })).toEqual({ w: 300, h: 200 });
  });
});

describe("naming a dropped file", () => {
  it("keeps a clean name and puts it in assets next to the diagram", () => {
    expect(assetFileName("logo.png", "image/png", new Set())).toBe("logo.png");
  });

  it("makes the name lower case and safe", () => {
    expect(assetFileName("My Photo (1).JPG", "image/jpeg", new Set())).toBe("my-photo-1.jpg");
    expect(assetFileName("../../etc/x.png", "image/png", new Set())).toBe("x.png");
  });

  it("takes the extension from the type when the name has none or a wrong one", () => {
    expect(assetFileName("image", "image/png", new Set())).toBe("image.png");
    expect(assetFileName("diagram.txt", "image/svg+xml", new Set())).toBe("diagram.svg");
  });

  it("names a pasted image with no name image", () => {
    expect(assetFileName("", "image/webp", new Set())).toBe("image.webp");
  });

  it("adds a number until the name is unused", () => {
    expect(assetFileName("logo.png", "image/png", new Set(["assets/logo.png"]), "assets/")).toBe("logo-2.png");
    expect(assetFileName("logo.png", "image/png", new Set(["assets/logo.png", "assets/logo-2.png"]), "assets/")).toBe("logo-3.png");
  });

  it("is null for a file that is not a supported image", () => {
    expect(assetFileName("notes.txt", "text/plain", new Set())).toBeNull();
    expect(assetFileName("page.html", "text/html", new Set())).toBeNull();
  });
});

describe("adding an image", () => {
  const add = (d: DiagramDocument, file: ImageFile, storage = new MemoryStorage(), extra: Partial<Parameters<typeof addImage>[0]> = {}) =>
    addImage({ storage, diagramPath: "a.drawit.kdl", doc: d, file, at: { x: 500, y: 300 }, cap, measure: natural(200, 100), ...extra });

  it("writes the file to assets and adds an image element centred on the point at its natural size", async () => {
    const storage = new MemoryStorage();
    const { command, id } = await add(doc(), png(), storage);
    expect(await storage.read("assets/logo.png")).toEqual(Uint8Array.from([1, 2, 3]));
    const next = applyCommand(doc(), command).document;
    expect(id).toBe("logo");
    expect(next.elements).toEqual([{ kind: "image", id: "logo", src: "assets/logo.png" }]);
    expect(next.layout).toEqual([{ id: "logo", x: 400, y: 250, w: 200, h: 100 }]);
  });

  it("is one add command, placed after everything so it draws on top", async () => {
    const d = doc([{ kind: "node", id: "a", shape: "rect" }]);
    const { command } = await add(d, png());
    expect(command.type).toBe("add");
    expect(applyCommand(d, command).document.layout.at(-1)?.id).toBe("logo");
  });

  it("caps a large image to the canvas", async () => {
    const { command } = await add(doc(), png(), new MemoryStorage(), { measure: natural(4000, 2000) });
    expect(applyCommand(doc(), command).document.layout[0]).toMatchObject({ w: 1000, h: 500, x: 0, y: 50 });
  });

  it("writes next to the diagram when it is in a folder, and refers to it relative to the diagram", async () => {
    const storage = new MemoryStorage();
    const { command } = await add(doc(), png(), storage, { diagramPath: "sub/a.drawit.kdl" });
    expect(await storage.list()).toMatchObject([{ path: "sub/assets/logo.png" }]);
    expect(applyCommand(doc(), command).document.elements[0]).toMatchObject({ src: "assets/logo.png" });
  });

  it("never overwrites a file in assets, and gives the element an unused ID", async () => {
    const storage = new MemoryStorage({ "assets/logo.png": "mine" });
    const d = doc([{ kind: "node", id: "logo", shape: "rect" }]);
    const { command, id } = await add(d, png(), storage);
    expect(new TextDecoder().decode(await storage.read("assets/logo.png"))).toBe("mine");
    expect(await storage.read("assets/logo-2.png")).toEqual(Uint8Array.from([1, 2, 3]));
    expect(id).toBe("logo-2");
    expect(applyCommand(d, command).document.elements.at(-1)).toEqual({ kind: "image", id: "logo-2", src: "assets/logo-2.png" });
  });

  it("builds an ID from a file name that is not one", async () => {
    const { id } = await add(doc(), png("2024 Plan.png"));
    expect(id).toBe("image-2024-plan");
    expect((await add(doc(), png("???.png"))).id).toBe("image");
  });

  it("refuses a file that is not an image, writing nothing", async () => {
    const storage = new MemoryStorage();
    await expect(add(doc(), { name: "notes.txt", type: "text/plain", bytes: Uint8Array.from([1]) }, storage)).rejects.toThrow(/not a supported image/);
    expect(await storage.list()).toEqual([]);
  });

  it("refuses a file over the size limit, writing nothing", async () => {
    const storage = new MemoryStorage();
    await expect(add(doc(), png("big.png", new Uint8Array(MAX_FILE_BYTES + 1)), storage)).rejects.toMatchObject({ code: "too-large" });
    expect(await storage.list()).toEqual([]);
  });

  it("refuses a file the browser cannot decode, writing nothing", async () => {
    const storage = new MemoryStorage();
    await expect(add(doc(), png(), storage, { measure: () => Promise.reject(new Error("bad")) })).rejects.toThrow(/cannot be read as an image/);
    expect(await storage.list()).toEqual([]);
  });

  it("uses the default image size for a file that reports none", async () => {
    const { command } = await add(doc(), png(), new MemoryStorage(), { measure: natural(0, 0) });
    expect(applyCommand(doc(), command).document.layout[0]).toMatchObject({ w: 80, h: 80 });
  });
});
