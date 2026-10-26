import { expect, test } from "@playwright/test";

// Pan and zoom in the real shell over an in-memory workspace.
const file = `diagram version=1

node a "Alpha" shape=rect
node b "Beta" shape=ellipse

layout {
  a x=0 y=0 w=100 h=50
  b x=3000 y=2000 w=100 h=50
}
`;

interface View {
  x: number;
  y: number;
  scale: number;
}
interface Hooks {
  view(): View;
  setView(view: View): void;
  history(): number;
  saved(): Promise<string>;
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.goto("/");
  await page.evaluate(async (text) => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { startShell } = await load<typeof import("../src/app/shell.ts")>("/src/app/shell.ts");
    const { MemoryStorage } = await load<typeof import("../src/storage/memory.ts")>("/src/storage/memory.ts");
    const storage = new MemoryStorage({ "a.drawit.kdl": text });
    const shell = await startShell(document.getElementById("app") as HTMLElement, storage);
    shell.setView({ x: 0, y: 0, scale: 1 });
    (window as unknown as { hooks: Hooks }).hooks = {
      view: () => shell.view,
      setView: (v) => { shell.setView(v); },
      history: () => (shell.file?.history.canUndo ? 1 : 0),
      saved: async () => new TextDecoder().decode(await storage.read("a.drawit.kdl")),
    };
  }, file);
});

const view = (page: import("@playwright/test").Page): Promise<View> =>
  page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.view());

const wheel = (page: import("@playwright/test").Page, init: { deltaX?: number; deltaY?: number; ctrlKey?: boolean }): Promise<void> =>
  page.evaluate((i) => {
    document.querySelector(".canvas")?.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: 300, clientY: 300, ...i }));
  }, init);

test("[T-013] opening a file fits it in the canvas", async ({ page }) => {
  // Reopen to see the fit: boot already reset the view for the other tests.
  await page.evaluate(() => {
    const select = document.querySelector(".bar select");
    select?.dispatchEvent(new Event("change"));
  });
  await expect.poll(async () => (await view(page)).scale).toBeLessThan(0.5);
  const box = await page.locator('g[data-id="b"] ellipse').boundingBox();
  expect(box?.x).toBeGreaterThan(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThan(1000);
});

test("[T-013] wheel scrolling pans the canvas and never changes the document", async ({ page }) => {
  await wheel(page, { deltaX: 20, deltaY: 40 });
  expect(await view(page)).toEqual({ x: -20, y: -40, scale: 1 });
  expect(await page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.history())).toBe(0);
  await expect(page.getByText("Unsaved changes")).toBeHidden();
  await expect(page.locator(".world")).toHaveAttribute("transform", "translate(-20 -40) scale(1)");
});

test("[T-013] ctrl plus wheel zooms about the cursor", async ({ page }) => {
  const before = await page.locator('g[data-id="a"] rect').boundingBox();
  await wheel(page, { deltaY: -100, ctrlKey: true });
  const after = await view(page);
  expect(after.scale).toBeGreaterThan(1);
  const box = await page.locator('g[data-id="a"] rect').boundingBox();
  expect(box?.width).toBeGreaterThan(before?.width ?? Infinity);
});

test("[T-013] space plus drag pans, and releasing space stops it", async ({ page }) => {
  await page.mouse.move(300, 300);
  await page.keyboard.down("Space");
  await page.mouse.down();
  await page.mouse.move(350, 330, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up("Space");
  expect(await view(page)).toEqual({ x: 50, y: 30, scale: 1 });
  await page.mouse.move(300, 300);
  await page.mouse.down();
  await page.mouse.move(400, 400, { steps: 4 });
  await page.mouse.up();
  expect(await view(page)).toEqual({ x: 50, y: 30, scale: 1 });
});

test("[T-013] middle-button drag pans", async ({ page }) => {
  await page.mouse.move(300, 300);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(310, 290, { steps: 2 });
  await page.mouse.up({ button: "middle" });
  expect(await view(page)).toEqual({ x: 10, y: -10, scale: 1 });
});

test("[T-013] Cmd/Ctrl plus = and - zoom, 0 resets", async ({ page }) => {
  await page.keyboard.press("ControlOrMeta+=");
  expect((await view(page)).scale).toBeCloseTo(1.25);
  await page.keyboard.press("ControlOrMeta+-");
  await page.keyboard.press("ControlOrMeta+-");
  expect((await view(page)).scale).toBeCloseTo(0.8);
  await page.keyboard.press("ControlOrMeta+0");
  expect((await view(page)).scale).toBe(1);
});

test("[T-013] Shift+1 zooms to fit all drawn elements", async ({ page }) => {
  await page.keyboard.press("Shift+1");
  const v = await view(page);
  expect(v.scale).toBeLessThan(0.5);
  const a = await page.locator('g[data-id="a"] rect').boundingBox();
  const b = await page.locator('g[data-id="b"] ellipse').boundingBox();
  for (const box of [a, b]) {
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(1000);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(700);
  }
});

test("[T-013] the view is not saved: a pan and zoom leave the file as it was", async ({ page }) => {
  const before = await page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.saved());
  await wheel(page, { deltaX: 5, deltaY: 5 });
  await page.keyboard.press("ControlOrMeta+s");
  expect(await page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.saved())).toBe(before);
});
