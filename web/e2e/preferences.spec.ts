import { expect, test, type Page } from "@playwright/test";

const file = `diagram version=1

node a "Alpha" shape=rect

layout {
  a x=40 y=40 w=100 h=50
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

const dialog = (page: Page) => page.getByRole("dialog", { name: "Preferences" });

test("the file pill ends with a Preferences button that opens the dialog on General", async ({ page }) => {
  await start(page, "file");
  const last = page.locator(".pill").first().getByRole("button").last();
  await expect(last).toHaveAccessibleName("Preferences");
  await last.click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByRole("tab")).toHaveText(["General", "Shortcuts"]);
  await expect(dialog(page).getByRole("tab", { name: "General" })).toHaveAttribute("aria-selected", "true");
  await expect(dialog(page).getByRole("tabpanel", { name: "General" })).toBeVisible();
});

test("the tabs switch between General and Shortcuts", async ({ page }) => {
  await start(page, "file");
  await page.getByRole("button", { name: "Preferences" }).click();
  await dialog(page).getByRole("tab", { name: "Shortcuts" }).click();
  await expect(dialog(page).getByRole("tab", { name: "Shortcuts" })).toHaveAttribute("aria-selected", "true");
  await expect(dialog(page).getByRole("tabpanel", { name: "Shortcuts" })).toBeVisible();
  await expect(dialog(page).getByRole("tabpanel", { name: "General" })).toBeHidden();
  await dialog(page).getByRole("tab", { name: "General" }).click();
  await expect(dialog(page).getByRole("tabpanel", { name: "General" })).toBeVisible();
});

test("Done and Escape close the dialog and hand focus back", async ({ page }) => {
  await start(page, "file");
  const opener = page.getByRole("button", { name: "Preferences" });
  await opener.focus();
  await page.keyboard.press("Enter");
  await dialog(page).getByRole("button", { name: "Done" }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(opener).toBeFocused();
  await opener.click();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
});

test("the start screen and a landing page each have a Preferences button", async ({ page }) => {
  for (const screen of ["home", "landing"] as const) {
    await start(page, screen);
    await page.locator(".bar").getByRole("button", { name: "Preferences" }).click();
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
  }
});

test("the status pill never overlaps the file pill, which includes the Preferences button", async ({ page }) => {
  await start(page, "file");
  for (let width = 1100; width >= 600; width -= 25) {
    await page.setViewportSize({ width, height: 700 });
    const status = page.locator(".status");
    if (!(await status.isVisible())) continue;
    const a = await status.boundingBox();
    const b = await page.locator(".pill").first().boundingBox();
    expect(a && b && a.x + a.width + 12 <= b.x).toBe(true);
  }
});
