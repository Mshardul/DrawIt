import { describe, expect, it } from "vitest";
import { createPackLoader, type PackFiles } from "../shapes/pack-loader.ts";
import type { ShapeManifest } from "../shapes/types.ts";
import { groupByCategory, libraryEntries, searchEntries } from "./entries.ts";

const OUTLINE = "M 0 0 H 64 V 64 H 0 Z";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path data-role="fill" d="${OUTLINE}"/></svg>`;

const shape = (id: string, name: string, category: string, tags: string[]): ShapeManifest => ({
  id,
  name,
  category,
  tags,
  svg: `${id}.svg`,
  size: { w: 64, h: 64 },
  outline: OUTLINE,
  anchors: { top: { x: 32, y: 0 }, right: { x: 64, y: 32 }, bottom: { x: 32, y: 64 }, left: { x: 0, y: 32 } },
  label: { x: 8, y: 8, w: 48, h: 48 },
  keepAspect: false,
});

const pack = (folder: string, shapes: ShapeManifest[]): PackFiles => ({
  folder,
  manifest: JSON.stringify({ pack: folder, version: 1, shapes }),
  svgs: Object.fromEntries(shapes.map((s) => [s.svg, svg])),
});

const loader = createPackLoader([
  pack("core", [shape("diamond", "Diamond", "Basic", ["decision", "rhombus"]), shape("process", "Process", "Flowchart", ["step"])]),
  pack("arch", [shape("server", "Server", "Architecture (generic)", ["host", "machine"])]),
]);

describe("library entries", () => {
  it("lists rectangle and ellipse first, as built-in entries named as a file writes them", () => {
    const [first, second] = libraryEntries(loader);
    expect(first).toMatchObject({ shape: "rect", name: "Rectangle", category: "Basic", builtIn: true });
    expect(second).toMatchObject({ shape: "ellipse", name: "Ellipse", category: "Basic", builtIn: true });
  });

  it("lists every pack shape by its full name with its manifest name, category and tags", () => {
    const entry = libraryEntries(loader).find((e) => e.shape === "arch.server");
    expect(entry).toEqual({ shape: "arch.server", name: "Server", category: "Architecture (generic)", tags: ["host", "machine"], builtIn: false });
  });
});

describe("library categories", () => {
  it("groups by category in the order of the shape categories, built-ins first, leaving out empty ones", () => {
    const groups = groupByCategory(libraryEntries(loader));
    expect(groups.map((g) => g.category)).toEqual(["Basic", "Flowchart", "Architecture (generic)"]);
    expect(groups[0]?.entries.map((e) => e.shape)).toEqual(["rect", "ellipse", "core.diamond"]);
  });
});

describe("library search", () => {
  const find = (query: string): string[] => searchEntries(libraryEntries(loader), query).map((e) => e.shape);

  it("returns everything for an empty or blank query", () => {
    expect(find("")).toHaveLength(5);
    expect(find("   ")).toHaveLength(5);
  });

  it("matches part of a name, ignoring case", () => {
    expect(find("SERV")).toEqual(["arch.server"]);
  });

  it("matches part of a tag", () => {
    expect(find("rhomb")).toEqual(["core.diamond"]);
    expect(find("oval")).toEqual(["ellipse"]);
  });

  it("needs every word of the query to match the name or a tag", () => {
    expect(find("decision diamond")).toEqual(["core.diamond"]);
    expect(find("decision server")).toEqual([]);
  });

  it("does not match the category or the shape's full name", () => {
    expect(find("flowchart")).toEqual([]);
    expect(find("arch.")).toEqual([]);
  });
});
