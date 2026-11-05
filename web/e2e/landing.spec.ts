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

test("a project landing lists its top-level diagrams and remembers the one you open", async ({ page }) => {
  await page.evaluate(async (text) => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { MemoryStorage, MemoryVolume } = await load<typeof import("../src/storage/memory.ts")>("/src/storage/memory.ts");
    const { startShell } = await load<typeof import("../src/app/shell.ts")>("/src/app/shell.ts");
    const root = document.getElementById("app");
    if (!root) throw new Error("missing app root");
    const volume = new MemoryVolume({
      path: "/DrawIt/Demo",
      library: "/DrawIt",
      files: { "network.drawit.kdl": text, "notes.txt": "x", "sub/hidden.drawit.kdl": text },
      places: { "/DrawIt": { files: { "Demo/network.drawit.kdl": text, "Demo/notes.txt": "x" } } },
    });
    const storage = new MemoryStorage({}, { volume });
    await storage.claimSession();
    await startShell(root, storage, { show: "landing" });
    (window as unknown as { hooks: { prefs(): Promise<unknown> } }).hooks = {
      prefs: () => storage.readPreferences(),
    };
  }, good);
  await expect(page.getByRole("heading", { name: "Demo" })).toBeVisible();
  await expect(page.getByRole("button", { name: "network" })).toBeVisible();
  await expect(page.getByRole("button", { name: "notes" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "hidden" })).toHaveCount(0);
  await expect(page.getByText("Opened folder")).toHaveCount(0);
  await page.getByRole("button", { name: "network" }).click();
  await expect(page.locator('g[data-id="a"] text')).toHaveText("Alpha");
  await page.getByRole("button", { name: "Home" }).click();
  await expect(page.getByRole("heading", { name: "Recent" })).toBeVisible();
  await page.getByRole("button", { name: "Home" }).click();
  await expect(page.getByRole("heading", { name: "Recent" })).toBeVisible();
  await expect(page.getByRole("button", { name: "network" })).toBeVisible();
  const prefs = await page.evaluate(() => (window as unknown as { hooks: { prefs(): Promise<{ recent?: Record<string, string[]> }> } }).hooks.prefs());
  expect(prefs.recent?.["/DrawIt/Demo"]).toEqual(["network.drawit.kdl"]);
  expect(prefs.recent?.["/DrawIt"]).toEqual(["Demo/network.drawit.kdl"]);
});

test("an opened folder shows its path and only its own recent diagrams", async ({ page }) => {
  await page.evaluate(async (text) => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { MemoryStorage, MemoryVolume } = await load<typeof import("../src/storage/memory.ts")>("/src/storage/memory.ts");
    const { startShell } = await load<typeof import("../src/app/shell.ts")>("/src/app/shell.ts");
    const root = document.getElementById("app");
    if (!root) throw new Error("missing app root");
    const volume = new MemoryVolume({
      path: "/work/docs",
      library: "/DrawIt",
      files: { "architecture.drawit.kdl": text, "deploy.drawit.kdl": text },
    });
    const storage = new MemoryStorage({}, { volume });
    await storage.claimSession();
    await storage.patchPreferences({ recent: { "/work/docs": ["deploy.drawit.kdl"], "/DrawIt": ["Demo/network.drawit.kdl"] } });
    await startShell(root, storage, { show: "landing" });
  }, good);
  await expect(page.getByRole("heading", { name: "docs" })).toBeVisible();
  await expect(page.getByText("Opened folder")).toBeVisible();
  await expect(page.getByText("/work/docs")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent in this folder" })).toBeVisible();
  await expect(page.getByRole("button", { name: "deploy" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "network" })).toHaveCount(0);
});

test("picking a file that does not parse shows the error and leaves the page", async ({ page }) => {
  await page.evaluate(async () => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { MemoryStorage, MemoryVolume } = await load<typeof import("../src/storage/memory.ts")>("/src/storage/memory.ts");
    const { startShell } = await load<typeof import("../src/app/shell.ts")>("/src/app/shell.ts");
    const root = document.getElementById("app");
    if (!root) throw new Error("missing app root");
    const volume = new MemoryVolume({
      path: "/DrawIt/Demo",
      library: "/DrawIt",
      files: { "bad.drawit.kdl": "diagram {\n" },
    });
    const storage = new MemoryStorage({}, { volume });
    await storage.claimSession();
    await startShell(root, storage, { show: "landing" });
  });
  await page.getByRole("button", { name: "bad", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("bad.drawit.kdl");
  await expect(page.getByRole("alert")).toContainText(/line \d+, column \d+/);
  await expect(page.locator('g[data-id="a"]')).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Demo" })).toBeVisible();
});

test("a diagram added while the page is open shows up", async ({ page }) => {
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
    });
    const storage = new MemoryStorage({}, { volume });
    await storage.claimSession();
    await startShell(root, storage, { show: "landing" });
    (window as unknown as { hooks: { add(): Promise<void> } }).hooks = {
      add: () => storage.write("extra.drawit.kdl", new TextEncoder().encode("diagram version=1\n")),
    };
  }, good);
  await page.evaluate(() => (window as unknown as { hooks: { add(): Promise<void> } }).hooks.add());
  await expect(page.getByRole("button", { name: "extra" })).toBeVisible();
});
