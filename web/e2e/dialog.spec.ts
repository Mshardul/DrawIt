import { expect, test } from "@playwright/test";

const file = `diagram version=1

node a "Alpha" shape=rect

layout {
  a x=10 y=20 w=100 h=50
}
`;

interface Hooks {
  pending: Promise<string | null>;
  seen: string[];
  edit(): void;
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

async function openRename(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(async () => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { openDialog } = await load<typeof import("../src/app/dialog.ts")>("/src/app/dialog.ts");
    const root = document.getElementById("app");
    if (!root) throw new Error("missing app root");
    const opener = document.createElement("button");
    opener.textContent = "Open";
    const input = document.createElement("input");
    input.setAttribute("aria-label", "Name");
    root.replaceChildren(opener);
    opener.focus();
    (window as unknown as Hooks).pending = openDialog(root, {
      title: "Rename",
      body: input,
      choices: [{ label: "Cancel" }, { label: "Rename", kind: "primary" }],
    });
  });
}

test("a dialog traps focus, closes on Escape and returns focus", async ({ page }) => {
  await openRename(page);
  const dialog = page.getByRole("dialog", { name: "Rename" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Rename" })).toHaveClass(/primary/);
  await expect(dialog.getByRole("textbox", { name: "Name" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Rename" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("textbox", { name: "Name" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Rename" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as Hooks).pending)).toBeNull();
  await expect(page.getByRole("button", { name: "Open" })).toBeFocused();
});

test("clicking the scrim dismisses a dialog and a button answers with its label", async ({ page }) => {
  await openRename(page);
  await page.mouse.click(8, 8);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as Hooks).pending)).toBeNull();

  await openRename(page);
  await page.getByRole("button", { name: "Rename" }).click();
  expect(await page.evaluate(() => (window as unknown as Hooks).pending)).toBe("Rename");
});

test("a notice traps focus and closes on Escape or a button", async ({ page }) => {
  await page.evaluate(async () => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { openNotice } = await load<typeof import("../src/app/dialog.ts")>("/src/app/dialog.ts");
    const root = document.getElementById("app");
    if (!root) throw new Error("missing app root");
    root.replaceChildren();
    (window as unknown as Hooks).pending = openNotice(root, {
      body: "network.drawit.kdl changed on disk.",
      choices: [{ label: "Reload" }, { label: "Keep my edits", kind: "primary" }],
    });
  });
  const notice = page.getByRole("dialog", { name: "network.drawit.kdl changed on disk." });
  await expect(notice).toBeVisible();
  await expect(notice.getByRole("button", { name: "Reload" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(notice.getByRole("button", { name: "Keep my edits" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(notice.getByRole("button", { name: "Reload" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(notice).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as Hooks).pending)).toBeNull();

  await page.evaluate(async () => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { openNotice } = await load<typeof import("../src/app/dialog.ts")>("/src/app/dialog.ts");
    const root = document.getElementById("app");
    if (!root) throw new Error("missing app root");
    (window as unknown as Hooks).pending = openNotice(root, {
      body: "network.drawit.kdl changed on disk.",
      choices: [{ label: "Reload" }, { label: "Keep my edits", kind: "primary" }],
    });
  });
  await page.getByRole("button", { name: "Keep my edits" }).click();
  expect(await page.evaluate(() => (window as unknown as Hooks).pending)).toBe("Keep my edits");
});

test("canvas shortcuts stay quiet while a dialog or a field has focus", async ({ page }) => {
  await page.evaluate(async () => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { installKeyGuard } = await load<typeof import("../src/app/dialog.ts")>("/src/app/dialog.ts");
    installKeyGuard();
    const seen: string[] = [];
    addEventListener("keydown", (event) => { seen.push(event.key); });
    const input = document.createElement("input");
    input.setAttribute("aria-label", "Field");
    document.getElementById("app")?.append(input);
    (window as unknown as Hooks).seen = seen;
  });
  await page.getByRole("textbox", { name: "Field" }).focus();
  await page.keyboard.press("Delete");
  await page.keyboard.press("v");
  await page.keyboard.press(" ");
  await page.keyboard.press("ControlOrMeta+z");
  const quiet = await page.evaluate(() => (window as unknown as Hooks).seen);
  expect(quiet).not.toContain("Delete");
  expect(quiet).not.toContain("v");
  expect(quiet).not.toContain(" ");
  expect(quiet).not.toContain("z");
  await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); });
  await page.keyboard.press("v");
  expect(await page.evaluate(() => (window as unknown as Hooks).seen)).toContain("v");
});

test("an open dialog keeps Delete, undo and the tool keys off the canvas", async ({ page }) => {
  await page.evaluate(async (text) => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { mountShell } = await load<typeof import("../src/testing/mount-shell.ts")>("/src/testing/mount-shell.ts");
    const { shell } = await mountShell({ "a.drawit.kdl": text });
    (window as unknown as Hooks).edit = () => {
      const open = shell.file;
      if (!open) return;
      open.history.execute({ type: "setLayout", changes: [{ id: "a", set: { x: 40 } }] }, { selection: ["a"] });
      shell.refresh();
    };
  }, file);
  await page.evaluate(async () => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { openDialog } = await load<typeof import("../src/app/dialog.ts")>("/src/app/dialog.ts");
    const root = document.getElementById("app");
    if (!root) throw new Error("missing app root");
    (window as unknown as Hooks).edit();
    (window as unknown as Hooks).pending = openDialog(root, {
      title: "Rename",
      body: "Name the diagram",
      choices: [{ label: "Cancel" }, { label: "Rename", kind: "primary" }],
    });
  });
  await page.keyboard.press("Delete");
  await page.keyboard.press("l");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator('g[data-id="a"]')).toHaveCount(1);
  await expect(page.locator('g[data-id="a"]')).toHaveAttribute("transform", "translate(40 20)");
  await expect(page.getByRole("button", { name: "Arrow", exact: true })).not.toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Delete");
  await expect(page.locator('g[data-id="a"]')).toHaveCount(0);
});
