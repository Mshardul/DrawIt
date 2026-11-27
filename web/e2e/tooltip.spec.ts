import { expect, test, type Page } from "@playwright/test";

const file = `diagram version=1

node a "Alpha" shape=rect

layout {
  a x=40 y=40 w=100 h=50
}
`;

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto("/");
  await page.evaluate(async (text) => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { mountShell } = await load<typeof import("../src/testing/mount-shell.ts")>("/src/testing/mount-shell.ts");
    await mountShell({ "a.drawit.kdl": text }, { show: "file" });
  }, file);
});

const tip = (page: Page) => page.getByRole("tooltip");
const tool = (page: Page, name: string) => page.getByRole("toolbar").getByRole("button", { name, exact: true });

test("resting on a toolbar button shows its name and key after a delay", async ({ page }) => {
  await tool(page, "Rectangle").hover();
  await page.waitForTimeout(200);
  await expect(tip(page)).toBeHidden();
  await expect(tip(page)).toBeVisible();
  await expect(tip(page)).toHaveText("RectangleR");
});

test("moving on to the next button shows its tooltip at once", async ({ page }) => {
  await tool(page, "Rectangle").hover();
  await expect(tip(page)).toBeVisible();
  await tool(page, "Ellipse").hover();
  await expect(tip(page)).toHaveText("EllipseO", { timeout: 200 });
});

test("a press, Escape and the pointer leaving each close it", async ({ page }) => {
  await tool(page, "Hand").hover();
  await expect(tip(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tip(page)).toBeHidden();
  await page.mouse.move(700, 400);
  await page.waitForTimeout(500);
  await tool(page, "Hand").hover();
  await expect(tip(page)).toBeVisible();
  await page.mouse.down();
  await expect(tip(page)).toBeHidden();
  await page.mouse.up();
  await page.mouse.move(700, 400);
  await page.waitForTimeout(500);
  await tool(page, "Select").hover();
  await expect(tip(page)).toBeVisible();
  await page.mouse.move(700, 400);
  await expect(tip(page)).toBeHidden();
});

test("keyboard focus shows it and moving focus away closes it", async ({ page, browserName }) => {
  // WebKit on macOS leaves buttons out of the plain Tab order.
  const prefix = browserName === "webkit" ? "Alt+" : "";
  await tool(page, "Select").focus();
  await page.keyboard.press(`${prefix}Shift+Tab`);
  await page.keyboard.press(`${prefix}Tab`);
  await expect(tool(page, "Select")).toBeFocused();
  await expect(tip(page)).toHaveText("SelectV");
  await page.evaluate(() => { (document.activeElement as HTMLElement).blur(); });
  await expect(tip(page)).toBeHidden();
});

test("a library tile shows the shape name, and no button uses the browser's tooltip", async ({ page }) => {
  await page.getByRole("button", { name: "Rounded rectangle" }).hover();
  await expect(tip(page)).toHaveText("Rounded rectangle");
  await expect(page.locator("button[title]")).toHaveCount(0);
});

test("a disabled button still shows its tooltip, inside the window", async ({ page }) => {
  await page.keyboard.press("ControlOrMeta+a");
  const button = page.getByRole("button", { name: "Align left" });
  await expect(button).toBeDisabled();
  const box = await button.boundingBox();
  if (!box) throw new Error("no button");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(tip(page)).toHaveText("Align left");
  const shown = await tip(page).boundingBox();
  expect((shown?.x ?? 0) + (shown?.width ?? 0)).toBeLessThanOrEqual(1440);
});
