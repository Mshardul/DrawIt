import { describe, expect, it } from "vitest";
import { bundledLoader } from "./bundled-packs.ts";
import { insideOutline, nearOutline } from "./outline.ts";
import type { SvgEl } from "./svg.ts";

const CATEGORIES: { title: string; category: string; pack: string; ids: string[] }[] = [
  { title: "basic", category: "Basic", pack: "core", ids: ["rounded-rect", "circle", "diamond", "triangle", "pentagon", "hexagon", "octagon", "star", "callout", "callout-round", "bracket", "brace"] },
  { title: "flowchart", category: "Flowchart", pack: "core", ids: ["process", "decision", "terminator", "data", "document", "manual-input", "connector"] },
  { title: "arrows and lines", category: "Arrows and lines", pack: "core", ids: ["arrow-right", "arrow-left", "arrow-up", "arrow-down", "arrow-double", "arrow-curved", "arrow-u-turn", "divider"] },
  { title: "architecture", category: "Architecture (generic)", pack: "arch", ids: ["server", "database", "cache", "queue", "cdn", "load-balancer", "gateway", "dns", "firewall", "storage-bucket", "function", "container", "client", "browser", "mobile", "user", "cloud"] },
  { title: "network", category: "Network", pack: "net", ids: ["router", "switch", "vpn", "internet", "subnet", "on-prem"] },
  { title: "C4", category: "C4", pack: "c4", ids: ["person", "software-system", "container", "component", "boundary"] },
  { title: "infographic", category: "Infographic", pack: "info", ids: ["banner", "badge", "numbered-step", "timeline-marker", "ribbon"] },
];

describe("bundled shapes", () => {
  it("load without a problem", () => {
    expect(bundledLoader.problems).toEqual([]);
  });

  for (const { title, category, pack, ids } of CATEGORIES) {
    it(`${title}: every shape exists with a name, tags and its category`, () => {
      for (const id of ids) {
        const shape = bundledLoader.shape(`${pack}.${id}`);
        expect(shape, `${pack}.${id}`).toBeDefined();
        expect(shape?.name, `${pack}.${id} name`).not.toBe("");
        expect(shape?.tags.length, `${pack}.${id} tags`).toBeGreaterThan(0);
        expect(shape?.category, `${pack}.${id} category`).toBe(category);
      }
    });

    it(`${title}: no shape of the category is missing from the list`, () => {
      const found = bundledLoader.shapes().filter((s) => s.shape.category === category).map((s) => s.name);
      expect(found.sort()).toEqual(ids.map((id) => `${pack}.${id}`).sort());
    });
  }

  it("draw every shape at its default size, narrow and wide", () => {
    for (const { name, shape } of bundledLoader.shapes()) {
      for (const size of [shape.size, { w: 40, h: 40 }, { w: 400, h: 240 }]) {
        const drawing = bundledLoader.drawing(name, size);
        expect(drawing?.outline.length, name).toBeGreaterThan(2);
        expect(drawing?.svg.children.length, name).toBeGreaterThan(0);
      }
    }
  });

  it("give icon shapes one canvas size", () => {
    const icons = bundledLoader.shapes().filter((s) => s.shape.keepAspect && s.shape.category === "Architecture (generic)");
    expect(icons.length).toBeGreaterThan(10);
    expect(new Set(icons.map((s) => `${String(s.shape.size.w)}x${String(s.shape.size.h)}`))).toEqual(new Set(["96x96"]));
  });

  it("keep every corner of the label rectangle inside the outline", () => {
    const outside: string[] = [];
    for (const { name, shape } of bundledLoader.shapes()) {
      const outline = bundledLoader.drawing(name, shape.size)?.outline ?? [];
      const { x, y, w, h } = shape.label;
      for (const corner of [{ x, y }, { x: x + w, y }, { x, y: y + h }, { x: x + w, y: y + h }]) {
        if (!insideOutline(outline, corner) && !nearOutline(outline, corner, 0.5)) outside.push(`${name} (${String(corner.x)}, ${String(corner.y)})`);
      }
    }
    expect(outside).toEqual([]);
  });

  it("have no round part narrower than 6px and no rectangle part with a side under 8px", () => {
    const small: string[] = [];
    const walk = (name: string, el: SvgEl): void => {
      const n = (k: string): number => Number(el.attrs[k]);
      if (el.tag === "circle" && n("r") * 2 < 6) small.push(`${name} circle r=${String(n("r"))}`);
      if (el.tag === "ellipse" && Math.min(n("rx"), n("ry")) * 2 < 6) small.push(`${name} ellipse`);
      if (el.tag === "rect" && Math.min(n("width"), n("height")) < 8) small.push(`${name} rect ${String(n("width"))}x${String(n("height"))}`);
      el.children.forEach((child) => { walk(name, child); });
    };
    for (const { name, shape } of bundledLoader.shapes()) {
      const drawing = bundledLoader.drawing(name, shape.size);
      if (drawing) walk(name, drawing.svg);
    }
    expect(small).toEqual([]);
  });
});
