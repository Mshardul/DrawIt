import { describe, expect, it } from "vitest";
import type { DiagramDocument } from "../model/index.ts";
import { readDiagram } from "./read.ts";
import { writeDiagram } from "./write.ts";

function doc(partial: Partial<DiagramDocument> = {}): DiagramDocument {
  return {
    version: 1,
    plugins: [],
    elements: [],
    style: { theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} }, classes: [], overrides: [] },
    layout: [],
    ...partial,
  };
}

// The spec example in canonical form: one element per line, fixed property order, no banners.
const canonical = `diagram version=1 title="Order flow" {
  plugins core@1 arch@1
}

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

style {
  theme default {
    color primary="#1F4E79" accent="#E8732A" ink="#1A1A1A"
    font heading=Inter body=Inter
    size h1=36 body=14
  }
  class accent weight=700 color=$accent
  class critical stroke=$accent stroke-width=2
  class boundary stroke=$primary dash=dashed
  el headline font=$heading size=$h1
  el backend-title weight=700
  el publish dash=dashed route=elbow head-end=arrow
}

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
  publish from=right to=top:0.5 via="480,230 520,290"
}
`;

const roundTrip = (text: string): string => writeDiagram(readDiagram(text).document);

describe("canonical writer", () => {
  it("writes the spec example in canonical form", () => {
    expect(roundTrip(canonical)).toBe(canonical);
  });

  it("is stable: writing what it read from its own output changes nothing", () => {
    const once = roundTrip(canonical);
    expect(roundTrip(once)).toBe(once);
  });

  it("normalises property order, spacing and blank lines", () => {
    const messy = `diagram   title="Order flow"   version=1 {
  plugins   core@1
}



node   api   shape=arch.gateway   class=x   "API"
edge a b label="L" id=e1 class=y



layout {
  api   y=2    x=1
  e1 to=left   from=top:0.3
}
`;
    expect(roundTrip(messy)).toBe(`diagram version=1 title="Order flow" {
  plugins core@1
}

node api "API" shape=arch.gateway class=x
edge a b id=e1 label="L" class=y

layout {
  api x=1 y=2
  e1 from=top:0.3 to=left
}
`);
  });

  it("writes a header without a block when there are no plugins", () => {
    expect(writeDiagram(doc({ title: "T" }))).toBe(`diagram version=1 title="T"\n`);
  });

  it("leaves out empty style and layout sections", () => {
    const out = writeDiagram(doc({ elements: [{ kind: "frame", id: "f" }] }));
    expect(out).toBe(`diagram version=1\n\nframe f\n`);
  });

  it("keeps layout order, which is z-order", () => {
    const out = writeDiagram(
      doc({
        elements: [
          { kind: "frame", id: "a" },
          { kind: "frame", id: "b" },
        ],
        layout: [
          { id: "b", x: 0, y: 0 },
          { id: "a", x: 1, y: 1 },
        ],
      }),
    );
    expect(out.indexOf("  b x=0")).toBeLessThan(out.indexOf("  a x=1"));
  });

  it("writes coordinates and sizes as integers", () => {
    const out = writeDiagram(
      doc({
        elements: [{ kind: "frame", id: "a" }],
        layout: [{ id: "a", x: 1.6, y: -0.4, w: 99.5, h: 10.2 }],
      }),
    );
    expect(out).toContain("  a x=2 y=0 w=100 h=10\n");
  });

  it("writes anchors, free-end points, bend points, label position and lock in fixed order", () => {
    const out = writeDiagram(
      doc({
        elements: [
          { kind: "frame", id: "f" },
          { kind: "edge", id: "e", from: null, to: "f" },
        ],
        layout: [
          { id: "f", x: 0, y: 0, locked: true },
          {
            id: "e",
            x: 0,
            y: 0,
            labelAt: 0.25,
            via: [{ x: 1, y: 2 }, { x: 3, y: 4 }],
            toPoint: { x: 9, y: 8 },
            fromPoint: { x: 7, y: 6 },
            to: "auto",
            from: { side: "left", at: 0.3 },
          },
        ],
      }),
    );
    expect(out).toContain("  f x=0 y=0 locked=#true\n");
    expect(out).toContain(`  e from=left:0.3 to=auto from-point="7,6" to-point="9,8" via="1,2 3,4" label-at=0.25\n`);
  });

  it("omits x and y on edge entries and drops entries for IDs not in structure", () => {
    const out = writeDiagram(
      doc({
        elements: [
          { kind: "frame", id: "a" },
          { kind: "edge", id: "a->a", from: "a", to: "a" },
        ],
        layout: [
          { id: "a", x: 0, y: 0 },
          { id: "a->a", x: 0, y: 0, from: "auto" },
          { id: "gone", x: 5, y: 5 },
        ],
      }),
    );
    expect(out).toContain("  a->a from=auto\n");
    expect(out).not.toContain("gone");
  });

  it("adds id= to an edge when the default id does not apply", () => {
    const out = writeDiagram(
      doc({
        elements: [
          { kind: "edge", id: "e1", from: "a", to: "b" },
          { kind: "edge", id: "e2", from: null, to: "b" },
          { kind: "edge", id: "a->b", from: "a", to: "b" },
        ],
      }),
    );
    expect(out).toBe(`diagram version=1\n\nedge a b id=e1\nedge - b id=e2\nedge a b\n`);
  });

  it("writes style properties in fixed order with kebab-case names", () => {
    const out = writeDiagram(
      doc({
        style: {
          theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} },
          classes: [
            {
              name: "c",
              props: { headEnd: "arrow", lineHeight: 1.5, italic: true, strokeWidth: 2, fill: "#fff", route: "elbow" },
            },
          ],
          overrides: [],
        },
      }),
    );
    expect(out).toContain(`  class c fill="#fff" stroke-width=2 italic=#true line-height=1.5 route=elbow head-end=arrow\n`);
  });

  it("quotes IDs that KDL requires to be quoted", () => {
    const out = writeDiagram(doc({ elements: [{ kind: "frame", id: "a b" }] }));
    expect(out).toContain(`frame "a b"\n`);
  });

  it("escapes line breaks and quotes in text", () => {
    const out = writeDiagram(doc({ elements: [{ kind: "text", id: "t", content: 'a\nb "c"' }] }));
    expect(out).toContain(`text t "a\\nb \\"c\\""\n`);
    const back = readDiagram(out).document.elements[0];
    expect(back).toMatchObject({ kind: "text", content: 'a\nb "c"' });
  });

  it("escapes control characters in text", () => {
    const content = "tab\there\u0001end\u2028";
    const out = writeDiagram(doc({ elements: [{ kind: "text", id: "t", content }] }));
    expect(readDiagram(out).document.elements[0]).toMatchObject({ content });
  });

  it("re-emits whole-line comments above their element and above the header", () => {
    const text = `// top
diagram version=1

// about a
// still about a
frame a
frame b
`;
    expect(roundTrip(text)).toBe(text);
  });

  it("re-emits unknown elements, nested children and their comments", () => {
    const text = `diagram version=1

// chart note
chart sales type=chart.bar title=Sales {
  // first row
  row Q1 10 20
  row Q2 30 40 {
    cell x=1
  }
}
frame a
`;
    expect(roundTrip(text)).toBe(text);
  });

  it("re-emits ext properties on elements, style props and layout entries", () => {
    const text = `diagram version=1

node n shape=rect class=c glow=#true
frame f

style {
  class c fill=red sparkle=3
}

layout {
  n x=1 y=2 pin=yes
}
`;
    expect(roundTrip(text)).toBe(text);
  });

  it("re-emits unknown style statements", () => {
    const text = `diagram version=1

style {
  class c fill=red
  gradient sunset from=red to=blue {
    stop 0
    stop 1
  }
}
`;
    expect(roundTrip(text)).toBe(text);
  });

  it("writes valid KDL that reads back to the same model", () => {
    const { document } = readDiagram(canonical);
    expect(readDiagram(writeDiagram(document)).document).toEqual(document);
  });

  it("round-trips the spec example with its banners without growing", () => {
    const banners = `diagram version=1

// ── structure ──
frame a

// ── style ──
style {
  class c fill=red
}

// ── layout (managed by app) ──
layout {
  a x=0 y=0
}
`;
    const once = roundTrip(banners);
    expect(roundTrip(once)).toBe(once);
    expect(once.match(/structure/g)).toHaveLength(1);
  });
});
