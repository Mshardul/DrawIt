import { expect, test } from "@playwright/test";

// The app shell over an in-memory workspace. `boot` runs the real shell in the page.
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
    const { mountShell } = await load<typeof import("../src/testing/mount-shell.ts")>("/src/testing/mount-shell.ts");
    const { shell, storage } = await mountShell(initial);
    (window as unknown as { hooks: Hooks }).hooks = {
      read: async (path) => new TextDecoder().decode(await storage.read(path)),
      edit: () => {
        shell.file?.history.execute({ type: "setLayout", changes: [{ id: "a", set: { x: 40 } }] });
        shell.refresh();
      },
    };
  }, files);
}

test("opens the first diagram of the folder and draws it", async ({ page }) => {
  await boot(page, { "a.drawit.kdl": good, "notes.txt": "x" });
  await expect(page.getByLabel("File").locator("option")).toHaveText(["a.drawit.kdl"]);
  await expect(page.locator('g[data-id="a"] text')).toHaveText("Alpha");
  await expect(page.locator('g[data-id="b"] ellipse')).toHaveCount(1);
  await expect(page.getByText("Unsaved changes")).toBeHidden();
});

test("shows the unsaved indicator after an edit and Cmd/Ctrl+S saves and clears it", async ({ page }) => {
  await boot(page, { "a.drawit.kdl": good });
  await page.evaluate(() => { (window as unknown as { hooks: Hooks }).hooks.edit(); });
  await expect(page.getByText("Unsaved changes")).toBeVisible();
  await expect(page.locator('g[data-id="a"]')).toHaveAttribute("transform", "translate(40 20)");
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByText("Unsaved changes")).toBeHidden();
  const saved = await page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.read("a.drawit.kdl"));
  expect(saved).toBe(good.replace("a x=10", "a x=40"));
});

test("opens another file from the list", async ({ page }) => {
  await boot(page, { "a.drawit.kdl": good, "b.drawit.kdl": good.replace("Alpha", "Other") });
  await page.getByLabel("File").selectOption("b.drawit.kdl");
  await expect(page.locator('g[data-id="a"] text')).toHaveText("Other");
});

test("refuses a file that is not valid KDL with its line and column, and never overwrites it", async ({ page }) => {
  await boot(page, { "a.drawit.kdl": good, "bad.drawit.kdl": bad });
  await page.getByLabel("File").selectOption("bad.drawit.kdl");
  await expect(page.getByRole("alert")).toContainText(/line \d+, column \d+/);
  await expect(page.getByRole("alert")).toContainText("bad.drawit.kdl");
  await page.keyboard.press("ControlOrMeta+s");
  expect(await page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.read("bad.drawit.kdl"))).toBe(bad);
  // The previous file stays open.
  await expect(page.locator('g[data-id="a"] text')).toHaveText("Alpha");
});

test("a folder with no diagram files says so", async ({ page }) => {
  await boot(page, { "notes.txt": "x" });
  await expect(page.getByRole("alert")).toContainText("No .drawit.kdl files");
});

test("a home or landing start leaves the diagram unopened", async ({ page }) => {
  for (const show of ["home", "landing"] as const) {
    await page.goto("/");
    const started = await page.evaluate(async ({ files, show: screen }) => {
      const load = <T>(path: string) => import(path) as Promise<T>;
      const { mountShell } = await load<typeof import("../src/testing/mount-shell.ts")>("/src/testing/mount-shell.ts");
      const { shell } = await mountShell(files, { show: screen });
      return { screen: shell.screen, open: shell.file !== null };
    }, { files: { "a.drawit.kdl": good }, show });
    expect(started).toEqual({ screen: show, open: false });
    await expect(page.locator('g[data-id="a"]')).toHaveCount(0);
    await expect(page.getByRole("alert")).toBeHidden();
  }
});

test("the app reads the session token from the URL fragment and talks to the server with it", async ({ page }) => {
  const seen: (string | undefined)[] = [];
  const sessions: (string | undefined)[] = [];
  const workspaces: (string | undefined)[] = [];
  await page.route("**/api/session", async (route) => {
    await route.fulfill({ json: { id: "tab-1" } });
  });
  await page.route("**/api/workspace", async (route) => {
    await route.fulfill({ json: { id: "ws-1", kind: "opened", path: "/work" } });
  });
  await page.route("**/api/files", async (route) => {
    seen.push(route.request().headers()["authorization"]);
    sessions.push(route.request().headers()["x-session-id"]);
    workspaces.push(route.request().headers()["x-workspace-id"]);
    await route.fulfill({ json: { files: [{ path: "s.drawit.kdl", size: 1, modified: "2026-10-26T00:00:00.000Z" }] } });
  });
  await page.route("**/api/file?path=s.drawit.kdl", async (route) => {
    seen.push(route.request().headers()["authorization"]);
    sessions.push(route.request().headers()["x-session-id"]);
    workspaces.push(route.request().headers()["x-workspace-id"]);
    await route.fulfill({ body: good });
  });
  // The page is already at "/", so a fragment-only change would not reload it.
  await page.goto("about:blank");
  await page.goto("/#secret-token");
  await expect(page.locator('g[data-id="a"] text')).toHaveText("Alpha");
  expect(seen).toEqual(["Bearer secret-token", "Bearer secret-token"]);
  expect(sessions).toEqual(["tab-1", "tab-1"]);
  expect(workspaces).toEqual(["ws-1", "ws-1"]);
  expect(page.url()).not.toContain("secret-token");
});
