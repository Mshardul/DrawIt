import { expect, test, type Page } from "@playwright/test";

// The style panel in the real shell over an in-memory workspace: edits write override lines, undo restores them.
const file = `diagram version=1

node a "Alpha" shape=rect
node b "Beta" shape=rect
node e "Eta" shape=ellipse
text t "note"
shape s shape=rect

style {
  el b fill="#ff0000"
}

layout {
  a x=40 y=40 w=100 h=50
  b x=200 y=40 w=100 h=50
  e x=360 y=40 w=100 h=50
  t x=40 y=200 w=200
  s x=360 y=200 w=100 h=50
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

test("choosing a font writes it and draws the label in it; undo restores Inter", async ({ page }) => {
  await select(page, ["a"]);
  await expect(field(page, "font")).toHaveValue("Inter");
  await field(page, "font").selectOption("Source Serif 4");
  expect(await overrides(page)).toContainEqual({ id: "a", props: { font: "Source Serif 4" } });
  await expect(page.locator('.canvas [data-id="a"] text').first()).toHaveAttribute("font-family", '"Source Serif 4"');
  await page.evaluate(() => { (window as unknown as { hooks: Hooks }).hooks.undo(); });
  await expect(field(page, "font")).toHaveValue("Inter");
});

test("size and weight are numbers and a bad size is refused", async ({ page }) => {
  await select(page, ["a"]);
  await field(page, "size").fill("20");
  await field(page, "size").press("Enter");
  await field(page, "weight").fill("700");
  await field(page, "weight").press("Enter");
  expect(await overrides(page)).toContainEqual({ id: "a", props: { size: 20, weight: 700 } });
  await expect(page.locator('.canvas [data-id="a"] text').first()).toHaveAttribute("font-size", "20");
  await field(page, "size").fill("0");
  await field(page, "size").press("Enter");
  await expect(field(page, "size")).toHaveAttribute("aria-invalid", "true");
});

test("italic and underline are checkboxes that write booleans", async ({ page }) => {
  await select(page, ["a"]);
  const italic = field(page, "italic");
  await expect(italic).not.toBeChecked();
  await italic.check();
  await field(page, "underline").check();
  expect(await overrides(page)).toContainEqual({ id: "a", props: { italic: true, underline: true } });
  const label = page.locator('.canvas [data-id="a"] text').first();
  await expect(label).toHaveAttribute("font-style", "italic");
  await expect(label).toHaveAttribute("text-decoration", "underline");
  await italic.uncheck();
  expect(await overrides(page)).toContainEqual({ id: "a", props: { underline: true, italic: false } });
});

test("a selection that differs in italic shows the checkbox as mixed", async ({ page }) => {
  await select(page, ["a"]);
  await field(page, "italic").check();
  await select(page, ["a", "b"]);
  expect(await field(page, "italic").evaluate((i: HTMLInputElement) => i.indeterminate)).toBe(true);
});

test("alignment is chosen from left, center and right, and a text box starts left", async ({ page }) => {
  await select(page, ["t"]);
  await expect(field(page, "align")).toHaveValue("left");
  await field(page, "align").selectOption("right");
  expect(await overrides(page)).toContainEqual({ id: "t", props: { align: "right" } });
  await select(page, ["a", "t"]);
  await expect(field(page, "align")).toHaveValue("");
});

test("text colour has a picker that offers the theme tokens", async ({ page }) => {
  await select(page, ["a"]);
  await panel(page).getByRole("button", { name: "Pick color" }).click();
  await picker(page, "color").getByRole("button", { name: "$accent" }).click();
  expect(await overrides(page)).toContainEqual({ id: "a", props: { color: "$accent" } });
  await expect(page.locator('.canvas [data-id="a"] text').first()).toHaveAttribute("fill", "#e8732a");
});

test("a shape has no text fields, and a selection with a shape edits only what has text", async ({ page }) => {
  await select(page, ["s"]);
  await expect(field(page, "fill")).toBeVisible();
  await expect(field(page, "size")).toHaveCount(0);
  await select(page, ["s", "a"]);
  await field(page, "size").fill("20");
  await field(page, "size").press("Enter");
  expect((await overrides(page)).map((o) => o.id)).toEqual(["b", "a"]);
});

test("dash is chosen from solid, dashed and dotted and is drawn", async ({ page }) => {
  await select(page, ["a"]);
  await expect(field(page, "dash")).toHaveValue("solid");
  await field(page, "dash").selectOption("dashed");
  expect(await overrides(page)).toContainEqual({ id: "a", props: { dash: "dashed" } });
  await expect(page.locator('.canvas [data-id="a"] rect').first()).toHaveAttribute("stroke-dasharray", /\d/);
  await field(page, "dash").selectOption("solid");
  await expect(page.locator('.canvas [data-id="a"] rect').first()).not.toHaveAttribute("stroke-dasharray");
});

test("a shadow is typed, drawn, refused when it does not parse, and cleared", async ({ page }) => {
  await select(page, ["a"]);
  const shadow = field(page, "shadow");
  await expect(shadow).toHaveValue("");
  await shadow.fill("2 4 6 #000000");
  await shadow.press("Enter");
  expect(await overrides(page)).toContainEqual({ id: "a", props: { shadow: "2 4 6 #000000" } });
  await expect(page.locator('.canvas [data-id="a"]').first()).toHaveAttribute("filter", /^url\(#/);
  await shadow.fill("big");
  await shadow.press("Enter");
  await expect(shadow).toHaveAttribute("aria-invalid", "true");
  await panel(page).getByRole("button", { name: "Clear shadow" }).click();
  await expect(page.locator('.canvas [data-id="a"]').first()).not.toHaveAttribute("filter");
});

test("a gradient is typed into fill and drawn, and a bad one is refused", async ({ page }) => {
  await select(page, ["a"]);
  const fill = field(page, "fill");
  await fill.fill("linear(90, #ff0000, #0000ff)");
  await fill.press("Enter");
  expect(await overrides(page)).toContainEqual({ id: "a", props: { fill: "linear(90, #ff0000, #0000ff)" } });
  await expect(page.locator('.canvas [data-id="a"] rect').first()).toHaveAttribute("fill", /^url\(#/);
  await fill.fill("linear(90, #ff0000)");
  await fill.press("Enter");
  await expect(fill).toHaveAttribute("aria-invalid", "true");
});
