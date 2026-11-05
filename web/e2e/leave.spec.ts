import { expect, test } from "@playwright/test";

const good = `diagram version=1

node a "Alpha" shape=rect
node b "Beta" shape=ellipse

layout {
  a x=10 y=20 w=100 h=50
  b x=200 y=20 w=100 h=50
}
`;

interface Hooks {
  read(path: string): Promise<string>;
  write(path: string, text: string): Promise<void>;
  edit(): void;
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

async function boot(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(async (initial) => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { mountShell } = await load<typeof import("../src/testing/mount-shell.ts")>("/src/testing/mount-shell.ts");
    const { shell, storage } = await mountShell({ "a.drawit.kdl": initial });
    (window as unknown as { hooks: Hooks }).hooks = {
      read: async (path) => new TextDecoder().decode(await storage.read(path)),
      write: async (path, text) => {
        await storage.write(path, new TextEncoder().encode(text));
      },
      edit: () => {
        shell.file?.history.execute({ type: "setLayout", changes: [{ id: "a", set: { x: 40 } }] });
        shell.refresh();
      },
    };
  }, good);
}

test("a save that finds the file changed on disk asks and does not write until answered", async ({ page }) => {
  await boot(page);
  const outside = good.replace('node a "Alpha"', 'node a "Zeta"');
  await page.evaluate(async (text) => {
    const hooks = (window as unknown as { hooks: Hooks }).hooks;
    hooks.edit();
    await hooks.write("a.drawit.kdl", text);
  }, outside);
  await page.getByRole("button", { name: "Not saved" }).click();
  const notice = page.getByRole("dialog", { name: /a\.drawit\.kdl changed on disk/ });
  await expect(notice).toBeVisible();
  await expect(notice.locator("b")).toHaveText("a.drawit.kdl changed on disk.");
  await expect(notice.getByText("Keep your edits and overwrite it, or reload and lose your edits.")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.read("a.drawit.kdl"))).toBe(outside);
  await page.keyboard.press("Escape");
  await expect(notice).toHaveCount(0);
  await expect(page.locator('g[data-id="a"] text')).toHaveText("Alpha");
  await page.getByRole("button", { name: "Not saved" }).click();
  await expect(notice).toBeVisible();
  await notice.getByRole("button", { name: "Keep my edits" }).click();
  await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();
  const saved = await page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.read("a.drawit.kdl"));
  expect(saved).toContain("a x=40");
  expect(saved).toContain('node a "Alpha"');
});

test("an outside change while there are unsaved edits can reload the file", async ({ page }) => {
  await boot(page);
  const outside = good.replace('node a "Alpha"', 'node a "Zeta"');
  await page.evaluate(async (text) => {
    const hooks = (window as unknown as { hooks: Hooks }).hooks;
    hooks.edit();
    await hooks.write("a.drawit.kdl", text);
  }, outside);
  const notice = page.getByRole("dialog", { name: /a\.drawit\.kdl changed on disk/ });
  await expect(notice).toBeVisible();
  await notice.getByRole("button", { name: "Reload" }).click();
  await expect(page.locator('g[data-id="a"] text')).toHaveText("Zeta");
  await expect(page.locator('g[data-id="a"]')).toHaveAttribute("transform", "translate(10 20)");
  expect(await page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.read("a.drawit.kdl"))).toBe(outside);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator('g[data-id="a"] text')).toHaveText("Alpha");
  await expect(page.locator('g[data-id="a"]')).toHaveAttribute("transform", "translate(40 20)");
});

test("leaving the page warns only while there are unsaved edits", async ({ page }) => {
  await boot(page);
  const clean = await page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(clean).toBe(false);
  await page.evaluate(() => { (window as unknown as { hooks: Hooks }).hooks.edit(); });
  const dirty = await page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(dirty).toBe(true);
});
