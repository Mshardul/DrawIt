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

test("an empty library offers the ways in and no project grid", async ({ page }) => {
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
  await expect(page.getByRole("heading", { name: "Draw your first diagram" })).toBeVisible();
  await expect(page.getByText("~/DrawIt")).toBeVisible();
  await expect(page.getByRole("button", { name: "New diagram" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New project" })).toBeVisible();
  await expect(page.locator(".first-run").getByRole("button", { name: "Open folder…" })).toBeVisible();
  await expect(page.locator(".first-run").getByRole("button", { name: "Import a file" })).toBeVisible();
  await expect(page.locator(".bar").getByRole("button", { name: "Import", exact: true })).toBeVisible();
  await expect(page.locator(".bar").getByRole("button", { name: "Open folder…" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Projects" })).toHaveCount(0);
  await expect(page.locator(".cards")).toHaveCount(0);
});

test("a new diagram from home opens the draft it creates", async ({ page }) => {
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
  await page.getByRole("button", { name: "New diagram" }).click();
  await expect(page.locator(".name")).toHaveText("Untitled.drawit.kdl");
  await expect(page.getByRole("heading", { name: "Draw your first diagram" })).toHaveCount(0);
});

test("home shows a card per project, its latest diagram, and the library's recent diagrams", async ({ page }) => {
  await page.evaluate(async (text) => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { MemoryStorage, MemoryVolume } = await load<typeof import("../src/storage/memory.ts")>("/src/storage/memory.ts");
    const { startShell } = await load<typeof import("../src/app/shell.ts")>("/src/app/shell.ts");
    const root = document.getElementById("app");
    if (!root) throw new Error("missing app root");
    const volume = new MemoryVolume({
      path: "/DrawIt",
      library: "/DrawIt",
      folders: ["Demo", "Drafts", "Broken", "Huge"],
      files: {
        "Demo/network.drawit.kdl": text,
        "Drafts/Untitled 2.drawit.kdl": text,
        "Broken/bad.drawit.kdl": "diagram {\n",
        "Huge/big.drawit.kdl": " ".repeat(1024 * 1024 + 1),
      },
      places: {
        "/DrawIt/Demo": { files: { "network.drawit.kdl": text } },
        "/DrawIt/Drafts": { files: { "Untitled 2.drawit.kdl": text } },
      },
    });
    const storage = new MemoryStorage({}, { volume });
    await storage.claimSession();
    await storage.patchPreferences({ recent: { "/DrawIt": ["Drafts/Untitled 2.drawit.kdl", "Demo/network.drawit.kdl"] } });
    await startShell(root, storage, { show: "home" });
  }, good);
  const demo = page.getByRole("button", { name: "Demo" });
  await expect(demo).toBeVisible();
  await expect(demo).toContainText("1 diagram");
  await expect(demo.locator("svg.thumb")).toBeVisible();
  await expect(demo.locator(".file-icon")).toHaveCount(0);
  await expect(demo.locator(".th")).toHaveAttribute("title", "network");
  const broken = page.getByRole("button", { name: "Broken" });
  await expect(broken).toContainText("Can't open this file");
  await expect(broken.locator(".th")).toHaveAttribute("title", /line \d+, column \d+/);
  await expect(page.getByRole("button", { name: "Huge" })).toContainText("Too large to preview");
  await expect(page.getByRole("heading", { name: "Recent" })).toBeVisible();
  await page.getByRole("button", { name: "Untitled 2" }).click();
  await expect(page.locator('g[data-id="a"] text')).toHaveText("Alpha");
  await page.getByRole("button", { name: "Home" }).click();
  await expect(page.getByRole("heading", { name: "Drafts" })).toBeVisible();
});

test("cards off the screen are not drawn until they scroll into view", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 500 });
  await page.evaluate(async (text) => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { MemoryStorage, MemoryVolume } = await load<typeof import("../src/storage/memory.ts")>("/src/storage/memory.ts");
    const { startShell } = await load<typeof import("../src/app/shell.ts")>("/src/app/shell.ts");
    const root = document.getElementById("app");
    if (!root) throw new Error("missing app root");
    const files: Record<string, string> = {};
    const folders: string[] = [];
    for (let i = 0; i < 24; i += 1) {
      const name = `P${String(i).padStart(2, "0")}`;
      folders.push(name);
      files[`${name}/a.drawit.kdl`] = text;
    }
    const storage = new MemoryStorage({}, { volume: new MemoryVolume({ path: "/DrawIt", library: "/DrawIt", folders, files }) });
    await storage.claimSession();
    let reads = 0;
    const read = storage.read.bind(storage);
    storage.read = (path) => {
      reads += 1;
      return read(path);
    };
    (window as unknown as { hooks: { reads(): number } }).hooks = { reads: () => reads };
    await startShell(root, storage, { show: "home" });
  }, good);
  await expect(page.locator("svg.thumb").first()).toBeVisible();
  const before = await page.evaluate(() => (window as unknown as { hooks: { reads(): number } }).hooks.reads());
  expect(before).toBeGreaterThan(0);
  expect(before).toBeLessThan(24);
  await page.getByRole("button", { name: "P23" }).scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(() => (window as unknown as { hooks: { reads(): number } }).hooks.reads())).toBeGreaterThan(before);
});
