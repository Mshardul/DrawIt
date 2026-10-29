import { expect, test } from "@playwright/test";

// mount and patch on a bare SVG group in the real browser: what they leave alone, and that they
// still find the right groups after others were added, removed or reordered.
interface Spec {
  tag: string;
  attrs: Record<string, string | number>;
  children: Spec[];
  text?: string;
}


test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const root = document.createElementNS("http://www.w3.org/2000/svg", "g");
    root.setAttribute("id", "probe");
    svg.append(root);
    document.body.append(svg);
  });
});

const group = (id: string, x: number, label = "text"): Spec => ({
  tag: "g",
  attrs: { "data-id": id, transform: `translate(${String(x)} 0)` },
  children: [
    { tag: "rect", attrs: { width: 10, height: 10 }, children: [] },
    { tag: "text", attrs: { x }, children: [], text: label },
  ],
});

test("patching with the description a group already has touches no node", async ({ page }) => {
  const specs = [group("a", 0), group("b", 50)];
  const records = await page.evaluate(async (groups) => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { mount, patch } = await load<typeof import("../src/render/mount.ts")>("/src/render/mount.ts");
    const root = document.getElementById("probe") as unknown as SVGGElement;
    mount(root, groups);
    const observer = new MutationObserver(() => undefined);
    observer.observe(root, { attributes: true, childList: true, subtree: true, characterData: true });
    patch(root, groups);
    return observer.takeRecords().length;
  }, specs);
  expect(records).toBe(0);
});

test("a patch changes only the groups it names and keeps their nodes", async ({ page }) => {
  const result = await page.evaluate(
    async ({ before, after }) => {
      const load = <T>(path: string) => import(path) as Promise<T>;
      const { mount, patch } = await load<typeof import("../src/render/mount.ts")>("/src/render/mount.ts");
      const root = document.getElementById("probe") as unknown as SVGGElement;
      mount(root, before);
      const a = root.querySelector('[data-id="a"]') as SVGGElement;
      const b = root.querySelector('[data-id="b"]') as SVGGElement;
      const text = a.querySelector("text") as SVGTextElement;
      const observer = new MutationObserver(() => undefined);
      observer.observe(b, { attributes: true, childList: true, subtree: true, characterData: true });
      patch(root, after);
      const now = a.querySelector("text");
      return { aX: now?.getAttribute("x"), childKept: now === text, bUntouched: observer.takeRecords().length === 0, aText: now?.textContent };
    },
    { before: [group("a", 0), group("b", 50)], after: [group("a", 7, "moved")] },
  );
  expect(result).toEqual({ aX: "7", childKept: true, bUntouched: true, aText: "moved" });
});

test("a patch still finds its groups after mount added, removed and reordered some", async ({ page }) => {
  const result = await page.evaluate(
    async ({ first, second, patched }) => {
      const load = <T>(path: string) => import(path) as Promise<T>;
      const { mount, patch } = await load<typeof import("../src/render/mount.ts")>("/src/render/mount.ts");
      const root = document.getElementById("probe") as unknown as SVGGElement;
      mount(root, first);
      mount(root, second);
      patch(root, patched);
      const order = [...root.children].map((c) => c.getAttribute("data-id"));
      const transforms: Record<string, string | null> = {};
      for (const c of root.children) transforms[c.getAttribute("data-id") ?? ""] = c.getAttribute("transform");
      return { order, transforms };
    },
    {
      first: [group("a", 0), group("b", 10), group("c", 20)],
      second: [group("c", 20), group("a", 0), group("d", 30)],
      // "b" is gone and is ignored; "d" and "a" exist and are changed.
      patched: [group("b", 99), group("d", 31), group("a", 1)],
    },
  );
  expect(result.order).toEqual(["c", "a", "d"]);
  expect(result.transforms).toEqual({ c: "translate(20 0)", a: "translate(1 0)", d: "translate(31 0)" });
});

test("mount keeps the nodes of a group whose description did not change and rewrites one that did", async ({ page }) => {
  const result = await page.evaluate(
    async ({ before, after }) => {
      const load = <T>(path: string) => import(path) as Promise<T>;
      const { mount } = await load<typeof import("../src/render/mount.ts")>("/src/render/mount.ts");
      const root = document.getElementById("probe") as unknown as SVGGElement;
      mount(root, before);
      const a = root.querySelector('[data-id="a"]');
      const b = root.querySelector('[data-id="b"]');
      mount(root, after);
      return {
        keptA: root.querySelector('[data-id="a"]') === a,
        keptB: root.querySelector('[data-id="b"]') === b,
        bText: root.querySelector('[data-id="b"] text')?.textContent,
      };
    },
    { before: [group("a", 0), group("b", 10)], after: [group("a", 0), group("b", 10, "changed")] },
  );
  expect(result).toEqual({ keptA: true, keptB: true, bText: "changed" });
});
