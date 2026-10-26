import { expect, test } from "@playwright/test";
import type { DiagramDocument } from "../src/model/index.ts";

// The renderer's output is tested as data in src/render; these tests check what the browser draws.
interface Page {
  render(doc: DiagramDocument): void;
  frame(doc: DiagramDocument, moved: number): number;
}

const small: DiagramDocument = {
  version: 1,
  plugins: [],
  elements: [
    { kind: "node", id: "box", label: "Box", shape: "rect" },
    { kind: "node", id: "oval", label: "Oval", shape: "ellipse" },
    { kind: "text", id: "note", content: "one\ntwo" },
  ],
  style: { theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} }, classes: [], overrides: [] },
  layout: [
    { id: "box", x: 10, y: 20, w: 100, h: 50 },
    { id: "oval", x: 200, y: 20, w: 100, h: 50 },
    { id: "note", x: 10, y: 100 },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { describeDiagram } = await load<typeof import("../src/render/describe.ts")>("/src/render/describe.ts");
    const { mount } = await load<typeof import("../src/render/mount.ts")>("/src/render/mount.ts");
    document.body.style.margin = "0";
    document.body.innerHTML = '<svg id="canvas" xmlns="http://www.w3.org/2000/svg" width="1200" height="800"></svg>';
    const canvas = document.getElementById("canvas") as unknown as SVGSVGElement;
    (window as unknown as { page: Page }).page = {
      render: (doc) => {
        mount(canvas, describeDiagram(doc));
      },
      frame: (doc, moved) => {
        const moving = { ...doc, layout: doc.layout.map((e, i) => (i < moved ? { ...e, x: e.x + 1 } : e)) };
        const t0 = performance.now();
        mount(canvas, describeDiagram(moving));
        return performance.now() - t0;
      },
    };
  });
});

test("[T-012] draws a rectangle, an ellipse and a text box in the browser", async ({ page }) => {
  await page.evaluate((doc) => { (window as unknown as { page: Page }).page.render(doc); }, small);
  await expect(page.locator('g[data-id="box"] rect')).toHaveAttribute("width", "100");
  await expect(page.locator('g[data-id="oval"] ellipse')).toHaveAttribute("rx", "50");
  await expect(page.locator('g[data-id="note"] text')).toHaveText(["one", "two"]);
  await expect(page.locator('g[data-id="box"] text')).toHaveText("Box");
  const box = await page.locator('g[data-id="box"] rect').boundingBox();
  // The 1px stroke is centred on the edge, so the box is half a pixel larger on each side.
  expect(box?.x).toBeCloseTo(9.5, 0);
  expect(box?.y).toBeCloseTo(19.5, 0);
  expect(box?.width).toBeCloseTo(101, 0);
  expect(box?.height).toBeCloseTo(51, 0);
});

test("[T-012] drawing again updates in place: a moved element keeps its DOM node, a removed one goes", async ({ page }) => {
  const result = await page.evaluate((doc) => {
    const p = (window as unknown as { page: Page }).page;
    p.render(doc);
    const before = document.querySelector('g[data-id="box"]');
    const moved: DiagramDocument = {
      ...doc,
      elements: doc.elements.filter((e) => e.id !== "oval"),
      layout: [{ id: "note", x: 0, y: 0 }, { id: "box", x: 99, y: 20, w: 100, h: 50 }],
    };
    p.render(moved);
    return {
      same: document.querySelector('g[data-id="box"]') === before,
      transform: before?.getAttribute("transform"),
      order: Array.from(document.querySelectorAll("#canvas > g")).map((g) => g.getAttribute("data-id")),
    };
  }, small);
  expect(result).toEqual({ same: true, transform: "translate(99 20)", order: ["note", "box"] });
});

test("[T-012] redrawing 500 elements with 100 moved holds the frame budget", async ({ page }) => {
  const median = await page.evaluate(async () => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { generateDiagram } = await load<typeof import("../src/testing/generate-diagram.ts")>(
      "/src/testing/generate-diagram.ts",
    );
    const doc = generateDiagram({ count: 500 });
    const p = (window as unknown as { page: Page }).page;
    p.render(doc);
    const times: number[] = [];
    for (let i = 0; i < 60; i++) times.push(p.frame(doc, 100));
    times.sort((a, b) => a - b);
    return times[30] ?? Infinity;
  });
  expect(median).toBeLessThan(16);
});
