import { expect, test, type Page } from "@playwright/test";

const file = `diagram version=1

node a "Alpha" shape=rect

layout {
  a x=40 y=40 w=100 h=50
}
`;

interface Hooks {
  shapes(): string[];
  texts(): string[];
  dirty(): boolean;
  read(): Promise<string>;
  edit(): void;
  prefs(): Promise<{ toolbar?: { x?: number; y?: number; shown?: boolean } }>;
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.goto("/");
  await page.evaluate(async (text) => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { mountShell } = await load<typeof import("../src/testing/mount-shell.ts")>("/src/testing/mount-shell.ts");
    const { shell, storage } = await mountShell({ "a.drawit.kdl": text });
    shell.setView({ x: 0, y: 0, scale: 1 });
    (window as unknown as { hooks: Hooks }).hooks = {
      shapes: () => (shell.file?.document.elements ?? []).flatMap((e) => (e.kind === "node" ? [e.shape] : [])),
      texts: () => (shell.file?.document.elements ?? []).flatMap((e) => (e.kind === "text" ? [e.id] : [])),
      dirty: () => shell.file?.dirty === true,
      read: async () => new TextDecoder().decode(await storage.read("a.drawit.kdl")),
      edit: () => {
        shell.file?.history.execute({ type: "setLayout", changes: [{ id: "a", set: { x: 80 } }] });
        shell.refresh();
      },
      prefs: () => storage.readPreferences(),
    };
  }, file);
});

const prefs = (page: Page) => page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.prefs());

test("the toolbar sits at the bottom centre and the pressed button follows the tool", async ({ page }) => {
  const stage = await page.locator(".stage").boundingBox();
  const bar = await page.locator(".toolbar").boundingBox();
  if (!stage || !bar) throw new Error("no toolbar");
  expect(Math.abs(bar.x + bar.width / 2 - (stage.x + stage.width / 2))).toBeLessThan(8);
  expect(stage.y + stage.height - (bar.y + bar.height)).toBeLessThan(28);
  await expect(page.locator(".toolbar").getByRole("button", { name: "Select", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("h");
  await expect(page.locator(".toolbar").getByRole("button", { name: "Hand", exact: true })).toHaveAttribute("aria-pressed", "true");
  const before = await page.locator(".world").getAttribute("transform");
  const canvas = await page.locator(".canvas").boundingBox();
  if (!canvas) throw new Error("no canvas");
  await page.mouse.move(canvas.x + 300, canvas.y + 300);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 360, canvas.y + 340, { steps: 4 });
  await page.mouse.up();
  expect(await page.locator(".world").getAttribute("transform")).not.toBe(before);
  await page.keyboard.press("v");
  await expect(page.locator(".toolbar").getByRole("button", { name: "Select", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("rectangle, ellipse and text place from the toolbar", async ({ page }) => {
  const canvas = await page.locator(".canvas").boundingBox();
  if (!canvas) throw new Error("no canvas");
  await page.locator(".toolbar").getByRole("button", { name: "Rectangle", exact: true }).click();
  await page.mouse.click(canvas.x + 200, canvas.y + 200);
  await page.keyboard.press("o");
  await page.mouse.click(canvas.x + 400, canvas.y + 200);
  const shapes = await page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.shapes());
  expect(shapes.filter((shape) => shape === "rect")).toHaveLength(2);
  expect(shapes.filter((shape) => shape === "ellipse")).toHaveLength(1);
  await page.keyboard.press("t");
  await page.mouse.click(canvas.x + 200, canvas.y + 360);
  await expect(page.locator("textarea.text-edit")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.texts())).toEqual(["text"]);
});

test("the grip moves the toolbar and a double-click returns it to the bottom centre", async ({ page }) => {
  const grip = page.getByRole("button", { name: "Move toolbar" });
  const before = await page.locator(".toolbar").boundingBox();
  const box = await grip.boundingBox();
  if (!before || !box) throw new Error("no grip");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y - 80, { steps: 5 });
  await page.mouse.up();
  const moved = await page.locator(".toolbar").boundingBox();
  if (!moved) throw new Error("no toolbar");
  expect(moved.x).toBeGreaterThan(before.x + 60);
  const saved = await prefs(page);
  expect(saved.toolbar?.x).not.toBe(0);
  expect(saved.toolbar?.shown).toBe(true);
  await grip.dblclick();
  const back = await page.locator(".toolbar").boundingBox();
  const stage = await page.locator(".stage").boundingBox();
  if (!back || !stage) throw new Error("no toolbar");
  expect(Math.abs(back.x + back.width / 2 - (stage.x + stage.width / 2))).toBeLessThan(8);
  expect((await prefs(page)).toolbar).toMatchObject({ x: 0, y: 0, shown: true });
});

test("Not saved writes the file", async ({ page }) => {
  await page.evaluate(() => { (window as unknown as { hooks: Hooks }).hooks.edit(); });
  await page.getByRole("button", { name: "Not saved" }).click();
  await expect(page.getByRole("button", { name: "Saved", exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.dirty())).toBe(false);
  expect(await page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.read())).toContain("a x=80");
});
