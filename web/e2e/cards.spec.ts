import { expect, test } from "@playwright/test";

const good = `diagram version=1

node a "Alpha" shape=rect

layout {
  a x=10 y=20 w=100 h=50
}
`;

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("a project card renames and deletes", async ({ page }) => {
  await page.evaluate(async (text) => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { MemoryStorage, MemoryVolume } = await load<typeof import("../src/storage/memory.ts")>("/src/storage/memory.ts");
    const { startShell } = await load<typeof import("../src/app/shell.ts")>("/src/app/shell.ts");
    const root = document.getElementById("app");
    if (!root) throw new Error("missing app root");
    const volume = new MemoryVolume({
      path: "/DrawIt",
      library: "/DrawIt",
      files: { "Demo/network.drawit.kdl": text, "Demo/plan.drawit.kdl": text },
      places: { "/DrawIt/Demo": { files: { "network.drawit.kdl": text, "plan.drawit.kdl": text } } },
    });
    const storage = new MemoryStorage({}, { volume });
    await storage.claimSession();
    await storage.patchPreferences({
      recent: { "/DrawIt": ["Demo/network.drawit.kdl"], "/DrawIt/Demo": ["network.drawit.kdl"] },
    });
    await startShell(root, storage, { show: "home" });
    (window as unknown as { hooks: { prefs(): Promise<unknown> } }).hooks = {
      prefs: () => storage.readPreferences(),
    };
  }, good);

  const demo = page.locator(".card-wrap").filter({ has: page.getByRole("button", { name: "Demo", exact: true }) });
  await demo.getByRole("button", { name: "Actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Rename" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Delete" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Move to project…" })).toHaveCount(0);
  await page.getByRole("heading", { name: "Projects" }).click();
  await expect(page.getByRole("menuitem", { name: "Rename" })).toHaveCount(0);

  await demo.getByRole("button", { name: "Actions" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menuitem", { name: "Rename" })).toHaveCount(0);

  await demo.getByRole("button", { name: "Actions" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const rename = page.getByRole("dialog", { name: "Rename project" });
  await expect(rename.getByRole("textbox", { name: "Name" })).toHaveValue("Demo");
  await rename.getByRole("textbox", { name: "Name" }).fill("Notes");
  await rename.getByRole("button", { name: "Rename" }).click();
  await expect(page.getByRole("button", { name: "Notes", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Demo", exact: true })).toHaveCount(0);
  const renamed = await page.evaluate(() => (window as unknown as { hooks: { prefs(): Promise<{ recent?: Record<string, string[]> }> } }).hooks.prefs());
  expect(renamed.recent?.["/DrawIt"]).toEqual(["Notes/network.drawit.kdl"]);
  expect(renamed.recent?.["/DrawIt/Notes"]).toEqual(["network.drawit.kdl"]);
  expect(renamed.recent?.["/DrawIt/Demo"]).toEqual([]);

  const notes = page.locator(".card-wrap").filter({ has: page.getByRole("button", { name: "Notes", exact: true }) });
  await notes.getByRole("button", { name: "Actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const removing = page.getByRole("dialog", { name: 'Delete "Notes"?' });
  await expect(removing).toContainText("This project and its 2 diagrams move to the Trash.");
  await removing.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Notes", exact: true })).toBeVisible();

  await notes.getByRole("button", { name: "Actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await removing.getByRole("button", { name: "Move to Trash" }).click();
  await expect(page.getByRole("button", { name: "Notes", exact: true })).toHaveCount(0);
});

test("an opened folder has no card menu", async ({ page }) => {
  await page.evaluate(async (text) => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { MemoryStorage, MemoryVolume } = await load<typeof import("../src/storage/memory.ts")>("/src/storage/memory.ts");
    const { startShell } = await load<typeof import("../src/app/shell.ts")>("/src/app/shell.ts");
    const root = document.getElementById("app");
    if (!root) throw new Error("missing app root");
    const storage = new MemoryStorage({}, {
      volume: new MemoryVolume({
        path: "/work/docs",
        library: "/DrawIt",
        files: { "architecture.drawit.kdl": text },
      }),
    });
    await storage.claimSession();
    await startShell(root, storage, { show: "landing" });
  }, good);
  await expect(page.getByRole("button", { name: "architecture", exact: true })).toBeVisible();
  await expect(page.getByText("Opened folder")).toBeVisible();
  await expect(page.getByRole("button", { name: "Actions" })).toHaveCount(0);
});

test("a library diagram renames, moves, and deletes, and asks again when there is no trash", async ({ page }) => {
  await page.evaluate(async (text) => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { MemoryStorage, MemoryVolume } = await load<typeof import("../src/storage/memory.ts")>("/src/storage/memory.ts");
    const { startShell } = await load<typeof import("../src/app/shell.ts")>("/src/app/shell.ts");
    const root = document.getElementById("app");
    if (!root) throw new Error("missing app root");
    const volume = new MemoryVolume({
      path: "/DrawIt/Demo",
      library: "/DrawIt",
      files: { "network.drawit.kdl": text, "plan.drawit.kdl": text },
      places: {
        "/DrawIt": { files: { "Demo/network.drawit.kdl": text, "Demo/plan.drawit.kdl": text, "Other/kept.drawit.kdl": text } },
        "/DrawIt/Other": { files: { "kept.drawit.kdl": text } },
      },
    });
    const storage = new MemoryStorage({}, { volume });
    await storage.claimSession();
    await storage.patchPreferences({
      recent: { "/DrawIt/Demo": ["network.drawit.kdl"], "/DrawIt": ["Demo/network.drawit.kdl"] },
    });
    await startShell(root, storage, { show: "landing" });
    (window as unknown as { hooks: { prefs(): Promise<unknown>; noTrash(): void } }).hooks = {
      prefs: () => storage.readPreferences(),
      noTrash: () => { volume.useTrash("missing"); },
    };
  }, good);

  const network = page.locator(".card-wrap").filter({ has: page.getByRole("button", { name: "network", exact: true }) });
  await network.getByRole("button", { name: "Actions" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const rename = page.getByRole("dialog", { name: "Rename diagram" });
  await expect(rename.getByText("Saved as network.drawit.kdl")).toBeVisible();
  await rename.getByRole("textbox", { name: "Name" }).fill("plan");
  await expect(rename.getByText("plan.drawit.kdl already exists in Demo.")).toBeVisible();
  await expect(rename.getByRole("button", { name: "Rename" })).toBeDisabled();
  await rename.getByRole("textbox", { name: "Name" }).fill("Vlan");
  await expect(rename.getByText("Saved as Vlan.drawit.kdl")).toBeVisible();
  await rename.getByRole("button", { name: "Rename" }).click();
  await expect(page.locator(".card-wrap").filter({ has: page.getByRole("button", { name: "Vlan", exact: true }) })).toBeVisible();
  const renamed = await page.evaluate(() => (window as unknown as { hooks: { prefs(): Promise<{ recent?: Record<string, string[]> }> } }).hooks.prefs());
  expect(renamed.recent?.["/DrawIt/Demo"]).toEqual(["Vlan.drawit.kdl"]);
  expect(renamed.recent?.["/DrawIt"]).toEqual(["Demo/Vlan.drawit.kdl"]);

  const vlan = page.locator(".card-wrap").filter({ has: page.getByRole("button", { name: "Vlan", exact: true }) });
  await vlan.getByRole("button", { name: "Actions" }).click();
  await page.getByRole("menuitem", { name: "Move to project…" }).click();
  const move = page.getByRole("dialog", { name: 'Move "Vlan" to a project' });
  await move.getByRole("option", { name: "Other" }).click();
  await move.getByRole("button", { name: "Move", exact: true }).click();
  await expect(page.getByRole("button", { name: "Vlan", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "‹ Home" }).click();
  await page.getByRole("button", { name: "Other", exact: true }).click();
  await expect(page.locator(".card-wrap").filter({ has: page.getByRole("button", { name: "Vlan", exact: true }) })).toBeVisible();

  await page.getByRole("button", { name: "‹ Home" }).click();
  await page.getByRole("button", { name: "Demo", exact: true }).click();
  const plan = page.locator(".card-wrap").filter({ has: page.getByRole("button", { name: "plan", exact: true }) });
  await plan.getByRole("button", { name: "Actions" }).click();
  await page.getByRole("menuitem", { name: "Move to project…" }).click();
  const again = page.getByRole("dialog", { name: 'Move "plan" to a project' });
  await again.getByRole("button", { name: "+ New project" }).click();
  const created = page.getByRole("dialog", { name: "New project" });
  await created.getByRole("textbox", { name: "Name" }).fill("Side");
  await created.getByRole("button", { name: "Create" }).click();
  await expect(again.getByRole("option", { name: "Side" })).toHaveAttribute("aria-selected", "true");
  await again.getByRole("button", { name: "Move", exact: true }).click();
  await expect(page.getByRole("button", { name: "plan", exact: true })).toHaveCount(0);

  await page.evaluate(() => { (window as unknown as { hooks: { noTrash(): void } }).hooks.noTrash(); });
  await page.getByRole("button", { name: "‹ Home" }).click();
  await page.getByRole("button", { name: "Other", exact: true }).click();
  const kept = page.locator(".card-wrap").filter({ has: page.getByRole("button", { name: "kept", exact: true }) });
  await kept.getByRole("button", { name: "Actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const trashing = page.getByRole("dialog", { name: 'Delete "kept"?' });
  await expect(trashing).toContainText("kept.drawit.kdl moves to the Trash.");
  await trashing.getByRole("button", { name: "Move to Trash" }).click();
  const permanent = page.getByRole("dialog", { name: 'Delete "kept" permanently?' });
  await expect(permanent).toContainText("This cannot be undone. kept.drawit.kdl will be removed from the disk.");
  await permanent.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "kept", exact: true })).toBeVisible();

  await kept.getByRole("button", { name: "Actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await trashing.getByRole("button", { name: "Move to Trash" }).click();
  await permanent.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page.getByRole("button", { name: "kept", exact: true })).toHaveCount(0);
});
