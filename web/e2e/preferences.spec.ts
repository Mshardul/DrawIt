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
  let shown = 0;
  for (let width = 1440; width >= 600; width -= 25) {
    await page.setViewportSize({ width, height: 700 });
    // Both pills are read in one step, two frames on, so the app has fitted them to this width.
    const gap = await page.evaluate(() => new Promise<number | null>((done) => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const status = document.querySelector<HTMLElement>(".stage .status");
        const file = document.querySelector(".stage > .pill:not(.status)");
        if (!status || !file || status.hidden) done(null);
        else done(file.getBoundingClientRect().left - status.getBoundingClientRect().right);
      }));
    }));
    if (gap === null) continue;
    shown += 1;
    expect(gap, `at ${String(width)} px`).toBeGreaterThanOrEqual(12);
  }
  expect(shown).toBeGreaterThan(0);
});

const warning = "Preferences can't be saved. Changes last until DrawIt closes.";

/** Starts the shell with a preferences file that refuses writes until `fix` is called. */
async function startUnwritable(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto("/");
  await page.evaluate(async (text) => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { MemoryStorage, MemoryVolume } = await load<typeof import("../src/storage/memory.ts")>("/src/storage/memory.ts");
    const { startShell } = await load<typeof import("../src/app/shell.ts")>("/src/app/shell.ts");
    const root = document.getElementById("app");
    if (!root) throw new Error("missing app root");
    const volume = new MemoryVolume({
      path: "/DrawIt",
      library: "/DrawIt",
      files: { "Demo/network.drawit.kdl": text },
      places: { "/DrawIt/Demo": { files: { "network.drawit.kdl": text } } },
    });
    const storage = new MemoryStorage({}, { volume });
    await storage.claimSession();
    const write = storage.patchPreferences.bind(storage);
    storage.patchPreferences = () => Promise.reject(new Error("cannot write preferences"));
    (window as unknown as { hooks: { fix(): void; file(): Promise<unknown> } }).hooks = {
      fix: () => { storage.patchPreferences = write; },
      file: () => storage.readPreferences(),
    };
    await startShell(root, storage, { show: "home" });
  }, file);
}

test("a failed write shows a notice in the dialog, and the change stays for the session", async ({ page }) => {
  await startUnwritable(page);
  await page.getByRole("button", { name: "Demo" }).click();
  await page.getByRole("button", { name: "network" }).first().click();
  await page.getByRole("checkbox", { name: "Grid", exact: true }).uncheck();
  await page.getByRole("button", { name: "Preferences" }).click();
  await expect(dialog(page).getByRole("alert")).toHaveText(warning);
  await dialog(page).getByRole("tab", { name: "Shortcuts" }).click();
  await expect(dialog(page).getByRole("alert")).toBeVisible();
  await dialog(page).getByRole("button", { name: "Done" }).click();
  await expect(dialog(page)).toHaveCount(0);

  await page.getByRole("checkbox", { name: "Snap" }).uncheck();
  await expect(page.getByRole("checkbox", { name: "Grid", exact: true })).not.toBeChecked();
  await page.getByRole("button", { name: "Home" }).click();
  await page.getByRole("button", { name: "Home" }).click();
  await expect(page.getByRole("heading", { name: "Recent" })).toBeVisible();
  await expect(page.getByRole("button", { name: "network" })).toBeVisible();
});

test("there is no notice while preferences can be written", async ({ page }) => {
  await start(page, "file");
  await page.getByRole("checkbox", { name: "Grid", exact: true }).uncheck();
  await page.getByRole("button", { name: "Preferences" }).click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByRole("alert")).toHaveCount(0);
});

test("the notice leaves once the held changes are written", async ({ page }) => {
  await startUnwritable(page);
  await page.locator(".bar").getByRole("button", { name: "Preferences" }).click();
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Demo" }).click();
  await page.evaluate(() => { (window as unknown as { hooks: { fix(): void } }).hooks.fix(); });
  await page.getByRole("button", { name: "network" }).first().click();
  await page.getByRole("button", { name: "Preferences" }).click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByRole("alert")).toHaveCount(0);
  await expect.poll(() => page.evaluate(async () => (await (window as unknown as { hooks: { file(): Promise<{ workspace?: { folder?: string } }> } }).hooks.file()).workspace?.folder)).toBe("/DrawIt/Demo");
});

const parts = [
  ["Library panel", ".library"],
  ["Properties panel", ".style-panel"],
  ["Toolbar", ".toolbar"],
  ["Status pill", ".stage .status"],
] as const;

test("each Interface checkbox hides and shows its part at once", async ({ page }) => {
  await start(page, "file");
  await page.keyboard.press("ControlOrMeta+a");
  await page.getByRole("button", { name: "Preferences" }).click();
  for (const [label, selector] of parts) {
    const box = dialog(page).getByRole("checkbox", { name: label, exact: true });
    await expect(box).toBeChecked();
    await expect(page.locator(selector)).toBeVisible();
    await box.uncheck();
    await expect(page.locator(selector)).toBeHidden();
    await box.check();
    await expect(page.locator(selector)).toBeVisible();
  }
});

test("a hidden part stays hidden when the dialog is reopened and when the selection changes", async ({ page }) => {
  await start(page, "file");
  await page.getByRole("button", { name: "Preferences" }).click();
  await dialog(page).getByRole("checkbox", { name: "Properties panel" }).uncheck();
  await dialog(page).getByRole("button", { name: "Done" }).click();
  await page.keyboard.press("ControlOrMeta+a");
  await expect(page.locator(".style-panel")).toBeHidden();
  await expect(page.getByRole("separator", { name: "Properties width" })).toBeHidden();
  await page.getByRole("button", { name: "Preferences" }).click();
  await expect(dialog(page).getByRole("checkbox", { name: "Properties panel" })).not.toBeChecked();
});

test("hiding a panel gives its width to the canvas", async ({ page }) => {
  await start(page, "file");
  const canvas = page.locator(".stage");
  const before = (await canvas.boundingBox())?.width ?? 0;
  await page.getByRole("button", { name: "Preferences" }).click();
  await dialog(page).getByRole("checkbox", { name: "Library panel" }).uncheck();
  await expect.poll(async () => (await canvas.boundingBox())?.width ?? 0).toBeGreaterThan(before + 200);
  await expect(page.getByRole("separator", { name: "Library width" })).toBeHidden();
});

test("Reset layout restores widths and the toolbar position and leaves visibility alone", async ({ page }) => {
  await start(page, "file");
  const grip = await page.getByRole("button", { name: "Move toolbar" }).boundingBox();
  const home = await page.locator(".toolbar").boundingBox();
  if (!grip || !home) throw new Error("no toolbar");
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + 100, grip.y - 200, { steps: 4 });
  await page.mouse.up();
  const edge = await page.getByRole("separator", { name: "Library width" }).boundingBox();
  if (!edge) throw new Error("no edge");
  await page.mouse.move(edge.x + 3, edge.y + 100);
  await page.mouse.down();
  await page.mouse.move(edge.x + 90, edge.y + 100, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => (await page.locator(".library").boundingBox())?.width).toBeGreaterThan(280);

  await page.getByRole("button", { name: "Preferences" }).click();
  await dialog(page).getByRole("checkbox", { name: "Status pill" }).uncheck();
  await dialog(page).getByRole("button", { name: "Reset layout" }).click();
  await expect.poll(async () => (await page.locator(".library").boundingBox())?.width).toBe(224);
  await expect.poll(async () => (await page.locator(".toolbar").boundingBox())?.y).toBe(home.y);
  await expect(dialog(page).getByRole("checkbox", { name: "Status pill" })).not.toBeChecked();
  await expect(page.locator(".stage .status")).toBeHidden();
});

test("the visibility choices are written to the preferences file", async ({ page }) => {
  await startUnwritable(page);
  await page.evaluate(() => { (window as unknown as { hooks: { fix(): void } }).hooks.fix(); });
  await page.locator(".bar").getByRole("button", { name: "Preferences" }).click();
  for (const [label] of parts) await dialog(page).getByRole("checkbox", { name: label, exact: true }).uncheck();
  await expect.poll(() => page.evaluate(async () => {
    const stored = await (window as unknown as { hooks: { file(): Promise<Record<string, Record<string, unknown> | undefined>> } }).hooks.file();
    return [stored["panels"]?.["libraryShown"], stored["panels"]?.["propertiesShown"], stored["toolbar"]?.["shown"], stored["status"]?.["shown"]];
  })).toEqual([false, false, false, false]);
});
