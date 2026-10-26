import { expect, test } from "@playwright/test";

// The app shell over an in-memory workspace. `boot` runs the real `startShell` in the page.
const good = `diagram version=1

node a "Alpha" shape=rect
node b "Beta" shape=ellipse

layout {
  a x=10 y=20 w=100 h=50
  b x=200 y=20 w=100 h=50
}
`;
const bad = 'diagram version=1\n\nnode a "unclosed\n';

interface Files {
  [path: string]: string;
}

interface Hooks {
  read(path: string): Promise<string>;
  edit(): void;
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

async function boot(page: import("@playwright/test").Page, files: Files): Promise<void> {
  await page.evaluate(async (initial) => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { startShell } = await load<typeof import("../src/app/shell.ts")>("/src/app/shell.ts");
    const { MemoryStorage } = await load<typeof import("../src/storage/memory.ts")>("/src/storage/memory.ts");
    const storage = new MemoryStorage(initial);
    const app = document.getElementById("app") as HTMLElement;
    const shell = await startShell(app, storage);
    (window as unknown as { hooks: Hooks }).hooks = {
      read: async (path) => new TextDecoder().decode(await storage.read(path)),
      edit: () => {
        shell.file?.history.execute({ type: "setLayout", changes: [{ id: "a", set: { x: 40 } }] });
        shell.refresh();
      },
    };
  }, files);
}

test("[T-016] opens the first diagram of the folder and draws it", async ({ page }) => {
  await boot(page, { "a.drawit.kdl": good, "notes.txt": "x" });
  await expect(page.locator("select option")).toHaveText(["a.drawit.kdl"]);
  await expect(page.locator('g[data-id="a"] text')).toHaveText("Alpha");
  await expect(page.locator('g[data-id="b"] ellipse')).toHaveCount(1);
  await expect(page.getByText("Unsaved changes")).toBeHidden();
});

test("[T-016] shows the unsaved indicator after an edit and Cmd/Ctrl+S saves and clears it", async ({ page }) => {
  await boot(page, { "a.drawit.kdl": good });
  await page.evaluate(() => { (window as unknown as { hooks: Hooks }).hooks.edit(); });
  await expect(page.getByText("Unsaved changes")).toBeVisible();
  await expect(page.locator('g[data-id="a"]')).toHaveAttribute("transform", "translate(40 20)");
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByText("Unsaved changes")).toBeHidden();
  const saved = await page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.read("a.drawit.kdl"));
  expect(saved).toBe(good.replace("a x=10", "a x=40"));
});

test("[T-016] opens another file from the list", async ({ page }) => {
  await boot(page, { "a.drawit.kdl": good, "b.drawit.kdl": good.replace("Alpha", "Other") });
  await page.locator("select").selectOption("b.drawit.kdl");
  await expect(page.locator('g[data-id="a"] text')).toHaveText("Other");
});

test("[T-016] refuses a file that is not valid KDL with its line and column, and never overwrites it", async ({ page }) => {
  await boot(page, { "a.drawit.kdl": good, "bad.drawit.kdl": bad });
  await page.locator("select").selectOption("bad.drawit.kdl");
  await expect(page.getByRole("alert")).toContainText(/line \d+, column \d+/);
  await expect(page.getByRole("alert")).toContainText("bad.drawit.kdl");
  await page.keyboard.press("ControlOrMeta+s");
  expect(await page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.read("bad.drawit.kdl"))).toBe(bad);
  // The previous file stays open.
  await expect(page.locator('g[data-id="a"] text')).toHaveText("Alpha");
});

test("[T-016] a folder with no diagram files says so", async ({ page }) => {
  await boot(page, { "notes.txt": "x" });
  await expect(page.getByRole("alert")).toContainText("No .drawit.kdl files");
});

test("[T-016] the app reads the session token from the URL fragment and talks to the server with it", async ({ page }) => {
  const seen: (string | undefined)[] = [];
  await page.route("**/api/files", async (route) => {
    seen.push(route.request().headers()["authorization"]);
    await route.fulfill({ json: { files: [{ path: "s.drawit.kdl", size: 1, modified: "2026-10-26T00:00:00.000Z" }] } });
  });
  await page.route("**/api/file?path=s.drawit.kdl", async (route) => {
    seen.push(route.request().headers()["authorization"]);
    await route.fulfill({ body: good });
  });
  // The page is already at "/", so a fragment-only change would not reload it.
  await page.goto("about:blank");
  await page.goto("/#secret-token");
  await expect(page.locator('g[data-id="a"] text')).toHaveText("Alpha");
  expect(seen).toEqual(["Bearer secret-token", "Bearer secret-token"]);
  expect(page.url()).not.toContain("secret-token");
});
