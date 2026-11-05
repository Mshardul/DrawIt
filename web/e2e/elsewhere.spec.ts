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

test("a second tab offers Use here and then opens the folder", async ({ page }) => {
  let held: string | null = null;
  const sessions: string[] = [];
  await page.route("**/api/session", async (route) => {
    const takeover = (route.request().postData() ?? "").includes('"takeover":true');
    if (takeover) held = "tab-2";
    if (held === null) {
      await route.fulfill({ status: 409, body: "DrawIt is open elsewhere\n" });
      return;
    }
    await route.fulfill({ json: { id: held } });
  });
  await page.route("**/api/workspace", async (route) => {
    await route.fulfill({ json: { id: "ws-1", kind: "opened", path: "/work" } });
  });
  await page.route("**/api/files", async (route) => {
    sessions.push(route.request().headers()["x-session-id"] ?? "");
    await route.fulfill({ json: { files: [] } });
  });
  await page.goto("about:blank");
  await page.goto("/#secret-token");
  await expect(page.getByRole("heading", { name: "DrawIt is open in another tab" })).toBeVisible();
  await expect(page.getByText("Only one tab can edit at a time, so nothing gets written to the wrong place.")).toBeVisible();
  await page.getByRole("button", { name: "Use here" }).click();
  await expect(page.getByRole("heading", { name: "work", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "DrawIt is open in another tab" })).toHaveCount(0);
  expect(sessions).toContain("tab-2");
  expect(await page.evaluate(() => sessionStorage.getItem("drawit.session"))).toBe("tab-2");
});

test("a tab that loses the session shows the same screen", async ({ page }) => {
  let claims = 0;
  await page.route("**/api/session", async (route) => {
    claims += 1;
    if (claims === 1) {
      await route.fulfill({ json: { id: "tab-1" } });
      return;
    }
    await route.fulfill({ status: 409, body: "DrawIt is open elsewhere\n" });
  });
  await page.route("**/api/workspace", async (route) => {
    await route.fulfill({ json: { id: "ws-1", kind: "opened", path: "/work" } });
  });
  await page.route("**/api/files", async (route) => {
    await route.fulfill({ json: { files: [] } });
  });
  await page.goto("about:blank");
  await page.goto("/#secret-token");
  await expect(page.getByRole("heading", { name: "work", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "DrawIt is open in another tab" })).toBeVisible();
});

test("losing the session keeps the unsaved edit", async ({ page }) => {
  await page.evaluate(async (initial) => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { mountShell } = await load<typeof import("../src/testing/mount-shell.ts")>("/src/testing/mount-shell.ts");
    const { showElsewhere } = await load<typeof import("../src/app/elsewhere.ts")>("/src/app/elsewhere.ts");
    const { shell } = await mountShell(initial);
    shell.file?.history.execute({ type: "setLayout", changes: [{ id: "a", set: { x: 40 } }] });
    shell.refresh();
    const root = document.getElementById("app");
    if (!root) throw new Error("missing app root");
    showElsewhere(root, () => Promise.resolve());
  }, { "a.drawit.kdl": good });
  await expect(page.getByRole("heading", { name: "DrawIt is open in another tab" })).toBeVisible();
  await expect(page.locator('g[data-id="a"]')).toHaveAttribute("transform", "translate(40 20)");
  await expect(page.getByText("Not saved")).toBeVisible();
  await page.getByRole("button", { name: "Use here" }).click();
  await expect(page.getByRole("heading", { name: "DrawIt is open in another tab" })).toHaveCount(0);
  await expect(page.locator('g[data-id="a"]')).toHaveAttribute("transform", "translate(40 20)");
  await expect(page.getByText("Not saved")).toBeVisible();
});
