import { expect, test, type Page } from "@playwright/test";

// The style panel in the real shell over an in-memory workspace: edits write override lines, undo restores them.
const file = `diagram version=1

node a "Alpha" shape=rect
node b "Beta" shape=rect
node e "Eta" shape=ellipse

style {
  el b fill="#ff0000"
}

layout {
  a x=40 y=40 w=100 h=50
  b x=200 y=40 w=100 h=50
  e x=360 y=40 w=100 h=50
}
`;

interface Override {
  id: string;
  props: object;
}
interface Hooks {
  select(ids: string[]): void;
  overrides(): Override[];
  undo(): void;
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.goto("/");
  await page.evaluate(async (text) => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { startShell } = await load<typeof import("../src/app/shell.ts")>("/src/app/shell.ts");
    const { MemoryStorage } = await load<typeof import("../src/storage/memory.ts")>("/src/storage/memory.ts");
    const shell = await startShell(
      document.getElementById("app") as HTMLElement,
      new MemoryStorage({ "a.drawit.kdl": text }),
    );
    (window as unknown as { hooks: Hooks }).hooks = {
      select: (ids) => {
        if (shell.file) shell.file.history.selection = ids;
        shell.refresh();
      },
      overrides: () => shell.file?.document.style.overrides ?? [],
      undo: () => {
        shell.file?.history.undo();
        shell.refresh();
      },
    };
  }, file);
});

const select = (page: Page, ids: string[]): Promise<void> =>
  page.evaluate((i) => { (window as unknown as { hooks: Hooks }).hooks.select(i); }, ids);
const overrides = (page: Page): Promise<Override[]> =>
  page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.overrides());
const panel = (page: Page) => page.getByRole("complementary", { name: "Style" });
const field = (page: Page, name: string) => panel(page).getByLabel(name, { exact: true });

test("the panel is hidden until something is selected", async ({ page }) => {
  await expect(panel(page)).toBeHidden();
  await select(page, ["a"]);
  await expect(panel(page)).toBeVisible();
});

test("editing fill writes an override and draws it; undo restores the default", async ({ page }) => {
  await select(page, ["a"]);
  await field(page, "fill").fill("#00ff00");
  await field(page, "fill").press("Enter");
  expect(await overrides(page)).toContainEqual({ id: "a", props: { fill: "#00ff00" } });
  await expect(page.locator('.canvas [data-id="a"] rect').first()).toHaveAttribute("fill", "#00ff00");
  await page.evaluate(() => { (window as unknown as { hooks: Hooks }).hooks.undo(); });
  expect((await overrides(page)).map((o) => o.id)).toEqual(["b"]);
  await expect(field(page, "fill")).toHaveValue("#dbe8f5");
});

test("a selection with different fills shows mixed, and an edit sets all of them", async ({ page }) => {
  await select(page, ["a", "b"]);
  const fill = field(page, "fill");
  await expect(fill).toHaveValue("");
  await expect(fill).toHaveAttribute("placeholder", "Mixed");
  await fill.fill("#00ff00");
  await fill.press("Enter");
  expect(await overrides(page)).toEqual([
    { id: "b", props: { fill: "#00ff00" } },
    { id: "a", props: { fill: "#00ff00" } },
  ]);
});

test("clear removes the override and the line", async ({ page }) => {
  await select(page, ["b"]);
  await panel(page).getByRole("button", { name: "Clear fill" }).click();
  expect(await overrides(page)).toEqual([]);
  await expect(field(page, "fill")).toHaveValue("#dbe8f5");
});

test("a value the property does not accept is refused and marked", async ({ page }) => {
  await select(page, ["a"]);
  const opacity = field(page, "opacity");
  await opacity.fill("3");
  await opacity.press("Enter");
  await expect(opacity).toHaveAttribute("aria-invalid", "true");
  expect((await overrides(page)).map((o) => o.id)).toEqual(["b"]);
});

test("radius is offered for a rectangle and not for an ellipse", async ({ page }) => {
  await select(page, ["a"]);
  await expect(field(page, "radius")).toBeVisible();
  await select(page, ["e"]);
  await expect(field(page, "radius")).toHaveCount(0);
});

const picker = (page: Page, name: string) => panel(page).getByRole("group", { name: `${name} colours` });

test("the picker offers theme tokens, and choosing one writes the token", async ({ page }) => {
  await select(page, ["a"]);
  await expect(picker(page, "fill")).toBeHidden();
  await panel(page).getByRole("button", { name: "Pick fill" }).click();
  const tokens = picker(page, "fill").getByRole("group", { name: "Theme" }).getByRole("button");
  await expect(tokens.first()).toHaveAccessibleName("$primary");
  await picker(page, "fill").getByRole("button", { name: "$accent" }).click();
  expect(await overrides(page)).toContainEqual({ id: "a", props: { fill: "$accent" } });
  await expect(page.locator('.canvas [data-id="a"] rect').first()).toHaveAttribute("fill", "#e8732a");
  await expect(picker(page, "fill")).toBeHidden();
});

test("a custom colour is written raw and then offered under recent colours", async ({ page }) => {
  await select(page, ["a"]);
  await panel(page).getByRole("button", { name: "Pick fill" }).click();
  await expect(picker(page, "fill").getByRole("group", { name: "Recent" })).toHaveCount(0);
  await picker(page, "fill").getByLabel("Custom fill").fill("#123456");
  expect(await overrides(page)).toContainEqual({ id: "a", props: { fill: "#123456" } });
  await select(page, ["b"]);
  await panel(page).getByRole("button", { name: "Pick stroke" }).click();
  await expect(picker(page, "stroke").getByRole("group", { name: "Recent" }).getByRole("button", { name: "#123456" })).toBeVisible();
  await picker(page, "stroke").getByRole("button", { name: "#123456" }).click();
  expect(await overrides(page)).toContainEqual({ id: "b", props: { fill: "#ff0000", stroke: "#123456" } });
});

test("Escape closes the picker", async ({ page }) => {
  await select(page, ["a"]);
  await panel(page).getByRole("button", { name: "Pick fill" }).click();
  await page.keyboard.press("Escape");
  await expect(picker(page, "fill")).toBeHidden();
});
