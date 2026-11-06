import { expect, test } from "@playwright/test";

const diagram = `diagram version=1

node a "Alpha" shape=rect

layout {
  a x=10 y=20 w=100 h=50
}
`;

interface Hooks {
  edit(): void;
  read(): Promise<string>;
  patch(preferences: { autosave: { library?: boolean; opened?: boolean } }): Promise<unknown>;
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

async function bootProject(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(async (text) => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { MemoryStorage, MemoryVolume } = await load<typeof import("../src/storage/memory.ts")>("/src/storage/memory.ts");
    const { startShell } = await load<typeof import("../src/app/shell.ts")>("/src/app/shell.ts");
    const root = document.getElementById("app");
    if (!root) throw new Error("missing app root");
    const volume = new MemoryVolume({
      path: "/lib",
      library: "/lib",
      folders: ["Demo"],
      places: { "/lib/Demo": { files: { "a.drawit.kdl": text } } },
    });
    const storage = new MemoryStorage({}, { volume });
    await storage.claimSession();
    await storage.openWorkspace({ project: "Demo" });
    const shell = await startShell(root, storage, { show: "file" });
    const write = storage.write.bind(storage);
    let writes = 0;
    storage.write = (path, data) => new Promise((resolve, reject) => {
      writes += 1;
      setTimeout(() => {
        write(path, data).then(resolve, reject);
      }, 400);
    });
    const saveButton = document.querySelector(".pill button.save");
    const labels: string[] = [saveButton?.textContent ?? ""];
    if (saveButton) {
      new MutationObserver(() => { labels.push(saveButton.textContent || ""); }).observe(saveButton, { childList: true, characterData: true, subtree: true });
    }
    (window as unknown as { hooks: Hooks; trace: { labels: string[]; writes: () => number } }).hooks = {
      edit: () => {
        shell.file?.history.execute({ type: "setLayout", changes: [{ id: "a", set: { x: 40 } }] });
        shell.refresh();
      },
      read: async () => new TextDecoder().decode(await storage.read("a.drawit.kdl")),
      patch: (preferences) => storage.patchPreferences(preferences),
    };
    (window as unknown as { trace: { labels: string[]; writes: () => number } }).trace = { labels, writes: () => writes };
  }, diagram);
}

async function bootFolder(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(async (text) => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { mountShell } = await load<typeof import("../src/testing/mount-shell.ts")>("/src/testing/mount-shell.ts");
    const { shell, storage } = await mountShell({ "a.drawit.kdl": text });
    (window as unknown as { hooks: Hooks }).hooks = {
      edit: () => {
        shell.file?.history.execute({ type: "setLayout", changes: [{ id: "a", set: { x: 40 } }] });
        shell.refresh();
      },
      read: async () => new TextDecoder().decode(await storage.read("a.drawit.kdl")),
      patch: (preferences) => storage.patchPreferences(preferences),
    };
  }, diagram);
}

test("a project saves on its own and the pill shows Saving", async ({ page }) => {
  await bootProject(page);
  await page.evaluate(() => { (window as unknown as { hooks: Hooks }).hooks.edit(); });
  await expect(page.getByRole("button", { name: "Not saved", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const trace = (window as unknown as { trace: { labels: string[]; writes: () => number } }).trace;
    return { labels: trace.labels.join(">"), writes: trace.writes() };
  })).toEqual({ labels: "Saved>Not saved>Saving>Saved", writes: 1 });
  expect(await page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.read())).toContain("a x=40");
});

test("an opened folder stays unsaved", async ({ page }) => {
  await bootFolder(page);
  await page.evaluate(() => { (window as unknown as { hooks: Hooks }).hooks.edit(); });
  await expect(page.getByRole("button", { name: "Not saved", exact: true })).toBeVisible();
  await page.waitForTimeout(2500);
  await expect(page.getByRole("button", { name: "Not saved", exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.read())).toContain("a x=10");
});

test("an opened folder saves on its own when its preference is on", async ({ page }) => {
  await page.evaluate(async (text) => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { MemoryStorage } = await load<typeof import("../src/storage/memory.ts")>("/src/storage/memory.ts");
    const { startShell } = await load<typeof import("../src/app/shell.ts")>("/src/app/shell.ts");
    const root = document.getElementById("app");
    if (!root) throw new Error("missing app root");
    const storage = new MemoryStorage({ "a.drawit.kdl": text });
    await storage.patchPreferences({ autosave: { opened: true } });
    const shell = await startShell(root, storage, { show: "file" });
    (window as unknown as { hooks: Hooks }).hooks = {
      edit: () => {
        shell.file?.history.execute({ type: "setLayout", changes: [{ id: "a", set: { x: 40 } }] });
        shell.refresh();
      },
      read: async () => new TextDecoder().decode(await storage.read("a.drawit.kdl")),
      patch: (preferences) => storage.patchPreferences(preferences),
    };
  }, diagram);
  await page.evaluate(() => { (window as unknown as { hooks: Hooks }).hooks.edit(); });
  await expect(page.getByRole("button", { name: "Saved", exact: true })).toBeVisible({ timeout: 4000 });
  expect(await page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.read())).toContain("a x=40");
});
