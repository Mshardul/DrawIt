import { expect, test, type Page } from "@playwright/test";

const file = `diagram version=1

node a "Alpha" shape=rect

layout {
  a x=40 y=40 w=100 h=50
}

style {
  el a stroke="#ff0000"
}
`;

async function start(page: Page, show: "file" | "landing" | "home"): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto("/");
  await page.evaluate(async ({ text, screen }) => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { mountShell } = await load<typeof import("../src/testing/mount-shell.ts")>("/src/testing/mount-shell.ts");
    await mountShell({ "a.drawit.kdl": text }, { show: screen });
  }, { text: file, screen: show });
}

const editorButtons = [
  "Select", "Hand", "Rectangle", "Ellipse", "Line", "Arrow", "Text", "Frame", "Image",
  "Home", "Undo", "Redo", "Export", "Preferences", "Zoom out", "Zoom in",
  "Align left", "Align centre", "Align right", "Align top", "Align middle", "Align bottom",
  "Distribute horizontally", "Distribute vertically", "Bring to front", "Send to back",
  "Pick fill", "Pick stroke", "Clear stroke",
];

test("each editor button is an icon with its words as name and tooltip", async ({ page }) => {
  await start(page, "file");
  await page.keyboard.press("ControlOrMeta+a");
  for (const name of editorButtons) {
    // The library has tiles that share a tool's name.
    const button = page.locator(".stage, .style-panel").getByRole("button", { name, exact: true });
    await expect(button.locator("svg.icon"), name).toHaveCount(1);
    await expect(button, name).toHaveText("");
    await expect(button, name).toHaveAttribute("data-tip", name);
  }
});

test("grid, snap and lock are icon toggles that keep their names", async ({ page }) => {
  await start(page, "file");
  await page.keyboard.press("ControlOrMeta+a");
  for (const name of ["Grid", "Snap", "Locked"]) {
    const toggle = page.locator(`[data-tip="${name}"]`);
    await expect(toggle.locator("svg.icon").first(), name).toBeVisible();
    await expect(toggle, name).toHaveText("");
    await expect(page.getByRole("checkbox", { name, exact: true })).toHaveCount(1);
  }
  const lock = page.locator('[data-tip="Locked"]');
  await expect(lock.locator("svg.icon:visible")).toHaveAttribute("data-icon", "unlocked");
  await page.getByRole("checkbox", { name: "Locked" }).check();
  await expect(lock.locator("svg.icon:visible")).toHaveAttribute("data-icon", "locked");
});

test("no button in the editor is left without a name", async ({ page }) => {
  await start(page, "file");
  await page.keyboard.press("ControlOrMeta+a");
  const unnamed = await page.locator("button:has(> svg.icon)").evaluateAll((buttons) =>
    buttons.filter((button) => button.textContent === "" && (!button.getAttribute("aria-label") || !button.getAttribute("data-tip"))).length);
  expect(unnamed).toBe(0);
});

test("a tooltip shows the key of an icon button", async ({ page }) => {
  await start(page, "file");
  await page.locator('[data-tip="Grid"]').hover();
  await expect(page.getByRole("tooltip")).toHaveText("GridG");
});

test("the save state stays written out", async ({ page }) => {
  await start(page, "file");
  await expect(page.locator(".pill button.save")).toHaveText("Saved");
});

test("start screen and landing page buttons show an icon with the word", async ({ page }) => {
  await start(page, "home");
  for (const name of ["Import", "Open folder…", "Preferences", "New diagram", "New project"]) {
    const button = page.locator(".btn", { hasText: name }).first();
    await expect(button.locator("svg.icon"), name).toHaveCount(1);
    await expect(button, name).toHaveText(name);
  }
  await start(page, "landing");
  const fresh = page.locator(".head .btn", { hasText: "New diagram" });
  await expect(fresh.locator("svg.icon")).toHaveCount(1);
});
