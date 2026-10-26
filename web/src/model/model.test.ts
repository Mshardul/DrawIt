import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, expectTypeOf, it } from "vitest";
import { ID_PATTERN, isValidId } from "./index.ts";
import type {
  Anchor,
  DiagramDocument,
  DiagramElement,
  EdgeElement,
  LayoutEntry,
  StyleProps,
} from "./index.ts";

// The spec 4.2 example, expressed as a model value.
const example: DiagramDocument = {
  version: 1,
  title: "Order flow",
  plugins: [
    { id: "core", version: 1 },
    { id: "arch", version: 1 },
  ],
  elements: [
    { kind: "frame", id: "overview", name: "Overview" },
    { kind: "text", id: "headline", content: "Orders grew 42% in Q3", class: "accent" },
    { kind: "node", id: "api", label: "API Gateway", shape: "arch.gateway" },
    { kind: "node", id: "orders", label: "Order Service", shape: "arch.server", class: "critical" },
    { kind: "shape", id: "backend", shape: "rect", class: "boundary" },
    { kind: "text", id: "backend-title", content: "Backend" },
    { kind: "edge", id: "publish", from: "orders", to: "queue" },
    { kind: "edge", id: "orders->db", from: "orders", to: "db", label: "writes" },
    { kind: "edge", id: "loose", from: null, to: "api" },
    { kind: "image", id: "logo", src: "assets/logo.svg" },
  ],
  style: {
    theme: {
      name: "default",
      colors: { primary: "#1F4E79", accent: "#E8732A" },
      fonts: { heading: "Inter" },
      sizes: { h1: 36, body: 14 },
      spaces: {},
    },
    classes: [
      { name: "accent", props: { color: "$accent", weight: 700 } },
      { name: "boundary", props: { stroke: "$primary", dash: "dashed" } },
    ],
    overrides: [
      { id: "headline", props: { font: "$heading", size: "$h1" } },
      { id: "publish", props: { dash: "dashed", route: "elbow", headEnd: "arrow" } },
    ],
  },
  layout: [
    { id: "overview", x: 0, y: 0, w: 720, h: 640 },
    { id: "api", x: 40, y: 150, w: 160, h: 60, locked: true },
    {
      id: "publish",
      x: 0,
      y: 0,
      via: [
        { x: 480, y: 230 },
        { x: 520, y: 290 },
      ],
      from: "auto",
      to: { side: "top", at: 0.5 },
      labelAt: 0.5,
    },
    { id: "loose", x: 0, y: 0, fromPoint: { x: 10, y: 20 } },
  ],
};

describe("document model", () => {
  it("[T-002] holds the spec example in structure, style and layout", () => {
    expect(example.elements).toHaveLength(10);
    expect(example.style.classes.map((c) => c.name)).toEqual(["accent", "boundary"]);
    expect(example.layout.map((e) => e.id)).toEqual(["overview", "api", "publish", "loose"]);
  });

  it("[T-002] discriminates elements by kind", () => {
    expectTypeOf<DiagramElement["kind"]>().toEqualTypeOf<
      "node" | "frame" | "edge" | "text" | "image" | "shape"
    >();
    const edge = example.elements.find((e): e is EdgeElement => e.kind === "edge");
    expectTypeOf(edge).toEqualTypeOf<EdgeElement | undefined>();
    expectTypeOf<EdgeElement["from"]>().toEqualTypeOf<string | null>();
  });

  it("[T-002] types anchors, layout entries and style props", () => {
    expectTypeOf<Anchor>().toEqualTypeOf<
      "auto" | { side: "top" | "right" | "bottom" | "left"; at?: number }
    >();
    expectTypeOf<LayoutEntry["x"]>().toEqualTypeOf<number>();
    expectTypeOf<LayoutEntry["w"]>().toEqualTypeOf<number | undefined>();
    expectTypeOf<StyleProps["route"]>().toEqualTypeOf<"straight" | "elbow" | undefined>();
  });

  it("[T-002] accepts IDs matching the pattern and rejects others", () => {
    expect(ID_PATTERN.source).toBe("^[a-z][a-z0-9_-]*$");
    for (const ok of ["a", "api", "backend-title", "x_1", "q2-3"]) expect(isValidId(ok)).toBe(true);
    for (const bad of ["", "1a", "A", "-a", "a b", "a.b", "a->b"]) expect(isValidId(bad)).toBe(false);
  });

  it("[T-002] imports nothing outside the model and touches no DOM", () => {
    const dir = new URL(".", import.meta.url);
    const sources = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    expect(sources).toContain("index.ts");
    for (const file of sources) {
      const text = readFileSync(new URL(file, dir), "utf8");
      for (const m of text.matchAll(/from\s+["']([^"']+)["']/g)) {
        expect(m[1], `${file} imports ${m[1] ?? ""}`).toMatch(/^\.\//);
      }
      const code = text.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
      expect(code, file).not.toMatch(/\b(document|window|HTMLElement|SVGElement)\b/);
    }
  });
});
