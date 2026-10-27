import { describe, expect, it } from "vitest";
import type { EdgeElement, NodeElement } from "../model/index.ts";
import { KdlSyntaxError, readDiagram } from "./read.ts";

// The spec example.
const example = `diagram version=1 title="Order flow" {
  plugins core@1 arch@1
}

// ── structure ─────────────────────────
frame overview "Overview"

text headline "Orders grew 42% in Q3" class=accent

node api "API Gateway" shape=arch.gateway
node orders "Order Service" shape=arch.server class=critical

shape backend shape=rect class=boundary
text backend-title "Backend"
node db "Orders DB" shape=arch.database
node queue "Events" shape=arch.queue

edge api orders label="POST /orders"
edge orders db
edge orders queue id=publish

image logo src="assets/logo.svg"

// ── style ─────────────────────────────
style {
  theme default {
    color primary="#1F4E79" accent="#E8732A" ink="#1A1A1A"
    font heading=Inter body=Inter
    size h1=36 body=14
  }
  class accent color=$accent weight=700
  class critical stroke=$accent stroke-width=2
  class boundary stroke=$primary dash=dashed
  el headline font=$heading size=$h1
  el backend-title weight=700
  el publish dash=dashed route=elbow head-end=arrow
}

// ── layout (managed by app) ───────────
layout {
  overview x=0 y=0 w=720 h=640
  headline x=40 y=24 w=600
  logo x=600 y=24 w=80 h=40
  backend x=240 y=260 w=420 h=200
  backend-title x=256 y=268
  api x=40 y=150 w=160 h=60
  orders x=280 y=150 w=180 h=60
  db x=260 y=320
  queue x=480 y=320
  publish via="480,230 520,290" from=right to=top:0.5
}
`;

describe("KDL v2 reader", () => {
  it("reads the header and plugins", () => {
    const { document } = readDiagram(example);
    expect(document.version).toBe(1);
    expect(document.title).toBe("Order flow");
    expect(document.plugins).toEqual([
      { id: "core", version: 1 },
      { id: "arch", version: 1 },
    ]);
  });

  it("reads structure elements in authored order", () => {
    const { document } = readDiagram(example);
    expect(document.elements.map((e) => `${e.kind}:${e.id}`)).toEqual([
      "frame:overview",
      "text:headline",
      "node:api",
      "node:orders",
      "shape:backend",
      "text:backend-title",
      "node:db",
      "node:queue",
      "edge:api->orders",
      "edge:orders->db",
      "edge:publish",
      "image:logo",
    ]);
    const orders = document.elements.find((e): e is NodeElement => e.id === "orders");
    expect(orders).toEqual({ kind: "node", id: "orders", label: "Order Service", shape: "arch.server", class: "critical" });
    // A banner comment is an ordinary whole-line comment, so it travels with the element below it.
    expect(document.elements.find((e) => e.id === "overview")).toEqual({
      kind: "frame",
      id: "overview",
      name: "Overview",
      comments: ["// ── structure ─────────────────────────"],
    });
    expect(document.elements.find((e) => e.id === "headline")).toEqual({
      kind: "text",
      id: "headline",
      content: "Orders grew 42% in Q3",
      class: "accent",
    });
    expect(document.elements.find((e) => e.id === "logo")).toEqual({ kind: "image", id: "logo", src: "assets/logo.svg" });
    expect(document.elements.find((e) => e.id === "backend")).toEqual({ kind: "shape", id: "backend", shape: "rect", class: "boundary" });
  });

  it("reads edges with derived and explicit IDs, labels and free ends", () => {
    const { document } = readDiagram(`edge a b label="x y"\nedge a b id=second\nedge - b id=loose\nedge a - id=loose2\n`);
    const edges = document.elements as EdgeElement[];
    expect(edges[0]).toEqual({ kind: "edge", id: "a->b", from: "a", to: "b", label: "x y" });
    expect(edges[1]).toEqual({ kind: "edge", id: "second", from: "a", to: "b" });
    expect(edges[2]).toEqual({ kind: "edge", id: "loose", from: null, to: "b" });
    expect(edges[3]).toEqual({ kind: "edge", id: "loose2", from: "a", to: null });
  });

  it("reads the style section: theme tokens, classes and overrides", () => {
    const { document } = readDiagram(example);
    expect(document.style.theme).toEqual({
      name: "default",
      colors: { primary: "#1F4E79", accent: "#E8732A", ink: "#1A1A1A" },
      fonts: { heading: "Inter", body: "Inter" },
      sizes: { h1: 36, body: 14 },
      spaces: {},
    });
    expect(document.style.classes).toEqual([
      { name: "accent", props: { color: "$accent", weight: 700 } },
      { name: "critical", props: { stroke: "$accent", strokeWidth: 2 } },
      { name: "boundary", props: { stroke: "$primary", dash: "dashed" } },
    ]);
    expect(document.style.overrides).toEqual([
      { id: "headline", props: { font: "$heading", size: "$h1" } },
      { id: "backend-title", props: { weight: 700 } },
      { id: "publish", props: { dash: "dashed", route: "elbow", headEnd: "arrow" } },
    ]);
  });

  it("reads the layout section in z-order with anchors and bend points", () => {
    const { document } = readDiagram(example);
    expect(document.layout.map((e) => e.id)).toEqual([
      "overview",
      "headline",
      "logo",
      "backend",
      "backend-title",
      "api",
      "orders",
      "db",
      "queue",
      "publish",
    ]);
    expect(document.layout[0]).toEqual({ id: "overview", x: 0, y: 0, w: 720, h: 640 });
    expect(document.layout[4]).toEqual({ id: "backend-title", x: 256, y: 268 });
    expect(document.layout[9]).toEqual({
      id: "publish",
      x: 0,
      y: 0,
      via: [
        { x: 480, y: 230 },
        { x: 520, y: 290 },
      ],
      from: { side: "right" },
      to: { side: "top", at: 0.5 },
    });
  });

  it("reads auto anchors, free end points, label position and lock", () => {
    const { document } = readDiagram(
      `layout {\n  e1 from=auto to=left:0.3 from-point="10,20" to-point="30,40" label-at=0.25\n  n1 x=1 y=2 locked=#true\n}\n`,
    );
    expect(document.layout).toEqual([
      { id: "e1", x: 0, y: 0, from: "auto", to: { side: "left", at: 0.3 }, fromPoint: { x: 10, y: 20 }, toPoint: { x: 30, y: 40 }, labelAt: 0.25 },
      { id: "n1", x: 1, y: 2, locked: true },
    ]);
  });

  it("reads a file with no sections as an empty diagram", () => {
    const { document, warnings } = readDiagram("");
    expect(document).toMatchObject({ version: 1, plugins: [], elements: [], layout: [] });
    expect(warnings).toEqual([]);
  });

  it("fails on invalid KDL with line and column", () => {
    const run = () => readDiagram('node a shape=rect\nnode "unterminated');
    expect(run).toThrow(KdlSyntaxError);
    try {
      run();
    } catch (error) {
      expect(error).toBeInstanceOf(KdlSyntaxError);
      const { line, column, message } = error as KdlSyntaxError;
      expect({ line, column }).toEqual({ line: 2, column: 19 });
      expect(message).toContain("line 2, column 19");
    }
  });

  it("fails on an unclosed block with line and column", () => {
    try {
      readDiagram("layout {\n  a x=1 y=2\n");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(KdlSyntaxError);
      expect((error as KdlSyntaxError).line).toBeGreaterThanOrEqual(1);
      expect((error as KdlSyntaxError).column).toBeGreaterThanOrEqual(1);
    }
  });

  it("keeps whole-line comments with the element below", () => {
    const { document, warnings } = readDiagram(`// the gateway\n// second line\nnode api shape=rect\nnode db shape=rect\n`);
    expect(document.elements[0]).toMatchObject({ id: "api", comments: ["// the gateway", "// second line"] });
    expect(document.elements[1]).not.toHaveProperty("comments");
    expect(warnings).toEqual([]);
  });

  it("drops end-of-line and block comments with a warning", () => {
    const { document, warnings } = readDiagram(`node api shape=rect // trailing\n/* block */\nnode db shape=rect\n`);
    expect(document.elements).toHaveLength(2);
    expect(document.elements[0]).not.toHaveProperty("comments");
    expect(document.elements[1]).not.toHaveProperty("comments");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/comment/i);
  });

  it("keeps unknown nodes with arguments, properties, children and comments", () => {
    const { document } = readDiagram(`// from a pack\ngadget g1 mode=fast enabled=#true nothing=#null {\n  // inner\n  part 1 2 tag=x\n}\nnode a shape=rect\n`);
    expect(document.elements.map((e) => e.kind)).toEqual(["unknown", "node"]);
    expect(document.elements[0]).toEqual({
      kind: "unknown",
      id: "g1",
      node: {
        name: "gadget",
        args: ["g1"],
        props: { mode: "fast", enabled: true, nothing: null },
        children: [{ name: "part", args: [1, 2], props: { tag: "x" }, children: [], comments: ["// inner"] }],
        comments: ["// from a pack"],
      },
    });
  });

  it("gives unknown nodes without a usable ID a generated one", () => {
    const { document } = readDiagram(`gadget\nwidget 5\n`);
    expect(document.elements.map((e) => e.id)).toEqual(["unknown-1", "unknown-2"]);
  });

  it("keeps unknown properties on known elements, style props and layout lines", () => {
    const { document } = readDiagram(
      `node a shape=rect owner="ops" weight=3\nstyle {\n  class c fill=red glow=#true\n  el a blur=4\n}\nlayout {\n  a x=1 y=2 depth=7\n}\n`,
    );
    expect(document.elements[0]).toEqual({ kind: "node", id: "a", shape: "rect", ext: { owner: "ops", weight: 3 } });
    expect(document.style.classes[0]).toEqual({ name: "c", props: { fill: "red", ext: { glow: true } } });
    expect(document.style.overrides[0]).toEqual({ id: "a", props: { ext: { blur: 4 } } });
    expect(document.layout[0]).toEqual({ id: "a", x: 1, y: 2, ext: { depth: 7 } });
  });

  it("keeps unknown style statements and unknown top-level sections", () => {
    const { document } = readDiagram(`style {\n  // pack rule\n  palette warm a=1\n}\n`);
    expect(document.style.unknown).toEqual([{ name: "palette", args: ["warm"], props: { a: 1 }, children: [], comments: ["// pack rule"] }]);
  });

  it("keeps a known keyword with missing arguments as an unknown node", () => {
    const { document } = readDiagram(`node\nedge onlyone\n`);
    expect(document.elements.map((e) => e.kind)).toEqual(["unknown", "unknown"]);
  });

  it("keeps a comment above the header", () => {
    const { document } = readDiagram(`// my diagram\ndiagram version=2\n`);
    expect(document.version).toBe(2);
    expect(document.comments).toEqual(["// my diagram"]);
  });
});
