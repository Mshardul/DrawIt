import { expect, test } from "@playwright/test";

const good = `diagram version=1

node a "Alpha" shape=rect

layout {
  a x=10 y=20 w=100 h=50
}
`;

const bad = 'node a shape=rect\nnode "unterminated';

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("import copies a diagram into a project and refuses one that does not parse", async ({ page }) => {
  await page.evaluate(async (text) => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { MemoryStorage, MemoryVolume } = await load<typeof import("../src/storage/memory.ts")>("/src/storage/memory.ts");
    const { startShell } = await load<typeof import("../src/app/shell.ts")>("/src/app/shell.ts");
    const root = document.getElementById("app");
    if (!root) throw new Error("missing app root");
    const storage = new MemoryStorage({}, {
      volume: new MemoryVolume({
        path: "/DrawIt",
        library: "/DrawIt",
        files: { "Demo/network.drawit.kdl": text },
        places: { "/DrawIt/Demo": { files: { "network.drawit.kdl": text } } },
      }),
    });
    await storage.claimSession();
    await startShell(root, storage, { show: "home" });
  }, good);

  await page.locator(".bar").getByRole("button", { name: "Import", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Import a diagram" });
  await expect(dialog.getByRole("button", { name: "Import", exact: true })).toBeDisabled();
  await dialog.locator("input[type=file]").setInputFiles({ name: "pitch.drawit.kdl", mimeType: "text/plain", buffer: Buffer.from(bad) });
  await expect(dialog.getByText(/Can't import: line 2, column 19/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Import", exact: true })).toBeDisabled();
  await dialog.locator("input[type=file]").setInputFiles({ name: "pitch.drawit.kdl", mimeType: "text/plain", buffer: Buffer.from("diagram version=1\n") });
  await expect(dialog.getByText(/Can't import/)).toHaveCount(0);
  await expect(dialog.getByRole("combobox", { name: "Project" })).toHaveValue("Demo");
  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Demo", exact: true }).click();
  await expect(page.getByRole("button", { name: "pitch", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "‹ Home" }).click();
  await page.locator(".bar").getByRole("button", { name: "Import", exact: true }).click();
  await dialog.locator("input[type=file]").setInputFiles({ name: "network.drawit.kdl", mimeType: "text/plain", buffer: Buffer.from(good) });
  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  await page.getByRole("button", { name: "Demo", exact: true }).click();
  await expect(page.getByRole("button", { name: "network 2", exact: true })).toBeVisible();
});

test("the folder browser lists, makes a folder, and opens a folder or a file", async ({ page }) => {
  await page.evaluate(async (text) => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { MemoryStorage, MemoryVolume } = await load<typeof import("../src/storage/memory.ts")>("/src/storage/memory.ts");
    const { startShell } = await load<typeof import("../src/app/shell.ts")>("/src/app/shell.ts");
    const root = document.getElementById("app");
    if (!root) throw new Error("missing app root");
    const storage = new MemoryStorage({}, {
      volume: new MemoryVolume({
        path: "/DrawIt",
        library: "/DrawIt",
        catalog: {
          "/": { folders: ["work"] },
          "/work": { folders: ["docs"], files: ["notes.drawit.kdl"] },
          "/work/docs": { files: ["architecture.drawit.kdl"] },
        },
        places: {
          "/work": { files: { "notes.drawit.kdl": text } },
          "/work/docs": { files: { "architecture.drawit.kdl": text } },
        },
      }),
    });
    await storage.claimSession();
    await startShell(root, storage, { show: "home" });
  }, good);

  await page.locator(".first-run").getByRole("button", { name: "Import a file" }).click();
  const importing = page.getByRole("dialog", { name: "Import a diagram" });
  await expect(importing.getByRole("button", { name: "Import", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(importing).toHaveCount(0);

  await page.locator(".bar").getByRole("button", { name: "Open folder…" }).click();
  const browser = page.getByRole("dialog", { name: "Open a folder or a file" });
  await expect(browser.getByRole("button", { name: "Open", exact: true })).toBeDisabled();
  await browser.getByRole("button", { name: "Enter work" }).click();
  await expect(browser.getByRole("button", { name: "Home", exact: true })).toBeVisible();
  await expect(browser.getByRole("option", { name: "notes.drawit.kdl" })).toBeVisible();
  await browser.getByRole("button", { name: "Home", exact: true }).click();
  await browser.getByRole("button", { name: "Enter work" }).click();
  await browser.getByRole("option", { name: "docs" }).click();
  await expect(browser.getByText("Selected: docs")).toBeVisible();
  await browser.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.getByRole("heading", { name: "docs" })).toBeVisible();
  await expect(page.getByText("Opened folder")).toBeVisible();
  await expect(page.getByRole("button", { name: "architecture", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "‹ Home" }).click();
  await page.locator(".bar").getByRole("button", { name: "Open folder…" }).click();
  await browser.getByRole("button", { name: "Enter work" }).click();
  await browser.getByRole("button", { name: "Enter docs" }).click();
  await browser.getByRole("button", { name: "New folder" }).click();
  const naming = page.getByRole("dialog", { name: "New folder" });
  await naming.getByRole("textbox", { name: "Name" }).fill("sketches");
  await naming.getByRole("button", { name: "Create" }).click();
  await expect(browser.getByText("Selected: sketches")).toBeVisible();
  await browser.getByRole("button", { name: "New folder" }).click();
  await naming.getByRole("textbox", { name: "Name" }).fill("sketches");
  await expect(naming.getByText('A folder named "sketches" already exists.')).toBeVisible();
  await page.keyboard.press("Escape");
  await browser.getByRole("option", { name: "architecture.drawit.kdl" }).click();
  await browser.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.locator(".pill .name")).toHaveText("architecture.drawit.kdl");
  await expect(page.locator('g[data-id="a"] text')).toHaveText("Alpha");
});
