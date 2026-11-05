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

test("New project asks for a name and refuses one that already exists", async ({ page }) => {
  await page.evaluate(async () => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { MemoryStorage, MemoryVolume } = await load<typeof import("../src/storage/memory.ts")>("/src/storage/memory.ts");
    const { startShell } = await load<typeof import("../src/app/shell.ts")>("/src/app/shell.ts");
    const root = document.getElementById("app");
    if (!root) throw new Error("missing app root");
    const storage = new MemoryStorage({}, { volume: new MemoryVolume({ path: "/DrawIt", library: "/DrawIt" }) });
    await storage.claimSession();
    await startShell(root, storage, { show: "home" });
  });
  await page.getByRole("button", { name: "New project", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New project" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Create" })).toBeDisabled();
  await dialog.getByRole("textbox", { name: "Name" }).fill("Home network");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Home network" })).toBeVisible();

  await page.getByRole("button", { name: "New project", exact: true }).click();
  await dialog.getByRole("textbox", { name: "Name" }).fill("home Network");
  await expect(dialog.getByText('A project named "Home network" already exists.')).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Create" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("New diagram on a landing page asks for a name and opens the empty file", async ({ page }) => {
  await page.evaluate(async (text) => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { MemoryStorage, MemoryVolume } = await load<typeof import("../src/storage/memory.ts")>("/src/storage/memory.ts");
    const { startShell } = await load<typeof import("../src/app/shell.ts")>("/src/app/shell.ts");
    const root = document.getElementById("app");
    if (!root) throw new Error("missing app root");
    const volume = new MemoryVolume({
      path: "/DrawIt/Demo",
      library: "/DrawIt",
      files: { "network.drawit.kdl": text },
      places: { "/DrawIt": { files: { "Demo/network.drawit.kdl": text } } },
    });
    const storage = new MemoryStorage({}, { volume });
    await storage.claimSession();
    await startShell(root, storage, { show: "landing" });
  }, good);
  await page.getByRole("button", { name: "New diagram", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New diagram" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: "Name" }).fill("network");
  await expect(dialog.getByText("network.drawit.kdl already exists in Demo.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Create" })).toBeDisabled();
  await dialog.getByRole("textbox", { name: "Name" }).fill("Plan");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".pill .name")).toHaveText("Plan.drawit.kdl");
  await expect(page.locator('g[data-id="a"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Home" }).click();
  await expect(page.getByRole("button", { name: "Plan", exact: true }).first()).toBeVisible();
});

test("New diagram in an opened folder writes the named file there", async ({ page }) => {
  await page.evaluate(async (text) => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { MemoryStorage, MemoryVolume } = await load<typeof import("../src/storage/memory.ts")>("/src/storage/memory.ts");
    const { startShell } = await load<typeof import("../src/app/shell.ts")>("/src/app/shell.ts");
    const root = document.getElementById("app");
    if (!root) throw new Error("missing app root");
    const storage = new MemoryStorage({}, {
      volume: new MemoryVolume({ path: "/work/docs", library: "/DrawIt", files: { "architecture.drawit.kdl": text } }),
    });
    await storage.claimSession();
    await startShell(root, storage, { show: "landing" });
  }, good);
  await page.getByRole("button", { name: "+ New diagram" }).click();
  const dialog = page.getByRole("dialog", { name: "New diagram" });
  await dialog.getByRole("textbox", { name: "Name" }).fill("Plan");
  await page.keyboard.press("Enter");
  await expect(page.locator(".pill .name")).toHaveText("Plan.drawit.kdl");
});
