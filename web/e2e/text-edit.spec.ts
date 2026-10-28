import { expect, test, type Page } from "@playwright/test";

const diagram = `diagram version=1

node a "Alpha" shape=rect
node b "The quick brown fox jumps over the lazy dog" shape=rect
text t "Note"

layout {
  a x=100 y=100 w=160 h=80
  b x=400 y=100 w=120 h=120
  t x=100 y=300
}
`;

interface Hooks {
  label(id: string): string | undefined;
  content(id: string): string | undefined;
  ids(): string[];
  dirty(): boolean;
  selection(): string[];
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async (text) => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { startShell } = await load<typeof import("../src/app/shell.ts")>("/src/app/shell.ts");
    const { MemoryStorage } = await load<typeof import("../src/storage/memory.ts")>("/src/storage/memory.ts");
    const shell = await startShell(document.getElementById("app") as HTMLElement, new MemoryStorage({ "d.drawit.kdl": text }));
    const find = (id: string) => shell.file?.document.elements.find((e) => e.id === id);
    (window as unknown as { hooks: Hooks }).hooks = {
      label: (id) => {
        const e = find(id);
        return e?.kind === "node" ? e.label : undefined;
      },
      content: (id) => {
        const e = find(id);
        return e?.kind === "text" ? e.content : undefined;
      },
      ids: () => shell.file?.document.elements.map((e) => e.id) ?? [],
      dirty: () => shell.file?.dirty ?? false,
      selection: () => shell.file?.history.selection ?? [],
    };
  }, diagram);
  await expect(page.locator('g[data-id="a"]')).toBeVisible();
});

const call = <K extends keyof Hooks>(page: Page, name: K, ...args: Parameters<Hooks[K]>): Promise<ReturnType<Hooks[K]>> =>
  page.evaluate(
    ([hookName, hookArgs]) => {
      const hooks = (window as unknown as { hooks: Record<string, (...a: unknown[]) => unknown> }).hooks;
      return (hooks[hookName as string] as (...a: unknown[]) => unknown)(...(hookArgs as unknown[]));
    },
    [name, args] as const,
  ) as Promise<ReturnType<Hooks[K]>>;

const editor = (page: Page) => page.locator("textarea.text-edit");

async function centre(page: Page, id: string): Promise<{ x: number; y: number }> {
  const box = await page.locator(`g[data-id="${id}"]`).boundingBox();
  if (!box) throw new Error(`no box for ${id}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test("double-clicking a node opens an editor holding its label, selected", async ({ page }) => {
  const at = await centre(page, "a");
  await page.mouse.dblclick(at.x, at.y);
  await expect(editor(page)).toBeFocused();
  await expect(editor(page)).toHaveValue("Alpha");
  const selected = await editor(page).evaluate((t: HTMLTextAreaElement) => t.value.slice(t.selectionStart, t.selectionEnd));
  expect(selected).toBe("Alpha");
});

test("while editing, the drawn copy of the text is hidden", async ({ page }) => {
  const at = await centre(page, "a");
  await page.mouse.dblclick(at.x, at.y);
  await expect(editor(page)).toBeVisible();
  await expect(page.locator('g[data-id="a"] text')).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(editor(page)).toHaveCount(0);
  await expect(page.locator('g[data-id="a"] text')).toHaveText("Alpha");
});

test("typing changes the label, and the whole burst is one undo step", async ({ page }) => {
  const at = await centre(page, "a");
  await page.mouse.dblclick(at.x, at.y);
  await page.keyboard.type("Beta gamma");
  expect(await call(page, "label", "a")).toBe("Beta gamma");
  expect(await call(page, "dirty")).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.locator('g[data-id="a"] text')).toHaveText("Beta gamma");
  await page.keyboard.press("ControlOrMeta+z");
  expect(await call(page, "label", "a")).toBe("Alpha");
  await expect(page.locator('g[data-id="a"] text')).toHaveText("Alpha");
});

test("clicking elsewhere keeps the typing and closes the editor", async ({ page }) => {
  const at = await centre(page, "a");
  await page.mouse.dblclick(at.x, at.y);
  await page.keyboard.type("Kept");
  await page.mouse.click(700, 500);
  await expect(editor(page)).toHaveCount(0);
  expect(await call(page, "label", "a")).toBe("Kept");
});

test("undo inside the editor reverts the typing and keeps editing", async ({ page }) => {
  const at = await centre(page, "a");
  await page.mouse.dblclick(at.x, at.y);
  await page.keyboard.type("Beta");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(editor(page)).toHaveValue("Alpha");
  expect(await call(page, "label", "a")).toBe("Alpha");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(editor(page)).toHaveValue("Beta");
});

test("the editor breaks lines where the drawn text breaks", async ({ page }) => {
  const at = await centre(page, "b");
  await page.mouse.dblclick(at.x, at.y);
  const shown = (await editor(page).inputValue()).split("\n").map((line) => line.trimEnd());
  expect(shown.length).toBeGreaterThan(2);
  await page.keyboard.press("Escape");
  const drawn = await page.locator('g[data-id="b"] text').allTextContents();
  expect(shown).toEqual(drawn);
});

test("typing into a wrapped label keeps the editor and the drawn text breaking together", async ({ page }) => {
  const at = await centre(page, "b");
  await page.mouse.dblclick(at.x, at.y);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.type(" and then some more words follow");
  const shown = (await editor(page).inputValue()).split("\n").map((line) => line.trimEnd());
  await page.keyboard.press("Escape");
  const drawn = await page.locator('g[data-id="b"] text').allTextContents();
  expect(shown).toEqual(drawn);
  expect(await call(page, "label", "b")).toBe("The quick brown fox jumps over the lazy dog and then some more words follow");
});

test("a line break typed in a label is kept", async ({ page }) => {
  const at = await centre(page, "a");
  await page.mouse.dblclick(at.x, at.y);
  await page.keyboard.type("one");
  await page.keyboard.press("Enter");
  await page.keyboard.type("two");
  await page.keyboard.press("Escape");
  expect(await call(page, "label", "a")).toBe("one\ntwo");
  await expect(page.locator('g[data-id="a"] text')).toHaveText(["one", "two"]);
});

test("double-clicking a text box edits its content", async ({ page }) => {
  const at = await centre(page, "t");
  await page.mouse.dblclick(at.x, at.y);
  await expect(editor(page)).toHaveValue("Note");
  await page.keyboard.type("Changed");
  await page.keyboard.press("Escape");
  expect(await call(page, "content", "t")).toBe("Changed");
});

test("double-clicking empty canvas makes a text box and edits it", async ({ page }) => {
  await page.mouse.dblclick(700, 500);
  await expect(editor(page)).toBeFocused();
  await page.keyboard.type("Fresh");
  await page.keyboard.press("Escape");
  expect(await call(page, "ids")).toContain("text");
  expect(await call(page, "content", "text")).toBe("Fresh");
  await expect(page.locator('g[data-id="text"] text')).toHaveText("Fresh");
  expect(await call(page, "selection")).toEqual(["text"]);
});

test("creating a text box and typing in it is one undo step", async ({ page }) => {
  await page.mouse.dblclick(700, 500);
  await page.keyboard.type("Fresh");
  await page.keyboard.press("Escape");
  await page.keyboard.press("ControlOrMeta+z");
  expect(await call(page, "ids")).not.toContain("text");
});

test("a new text box left empty is not kept and leaves nothing to undo", async ({ page }) => {
  await page.mouse.dblclick(700, 500);
  await expect(editor(page)).toBeVisible();
  await page.keyboard.press("Escape");
  expect(await call(page, "ids")).not.toContain("text");
  expect(await call(page, "dirty")).toBe(false);
});

test("a text box emptied by editing is removed, and undo brings it back", async ({ page }) => {
  const at = await centre(page, "t");
  await page.mouse.dblclick(at.x, at.y);
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Escape");
  expect(await call(page, "ids")).not.toContain("t");
  await page.keyboard.press("ControlOrMeta+z");
  expect(await call(page, "content", "t")).toBe("Note");
});

test("a label can be emptied and the node stays", async ({ page }) => {
  const at = await centre(page, "a");
  await page.mouse.dblclick(at.x, at.y);
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Escape");
  expect(await call(page, "ids")).toContain("a");
  expect(await call(page, "label", "a")).toBe("");
});

test("copying from the editor puts the real text on the clipboard, without the soft line breaks", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "clipboard permissions are only granted in Chromium");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const at = await centre(page, "b");
  await page.mouse.dblclick(at.x, at.y);
  await page.keyboard.press("ControlOrMeta+c");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe("The quick brown fox jumps over the lazy dog");
});

test("a pan or zoom while editing keeps the editor over its text", async ({ page }) => {
  const at = await centre(page, "a");
  await page.mouse.dblclick(at.x, at.y);
  const before = await editor(page).boundingBox();
  await page.evaluate(() => {
    const canvas = document.querySelector("svg.canvas") as SVGSVGElement;
    canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: -200, ctrlKey: true, clientX: 700, clientY: 500, bubbles: true, cancelable: true }));
  });
  const after = await editor(page).boundingBox();
  const text = await page.locator('g[data-id="a"]').boundingBox();
  expect(after?.width).not.toBe(before?.width);
  const midX = (after?.x ?? 0) + (after?.width ?? 0) / 2;
  expect(Math.abs(midX - ((text?.x ?? 0) + (text?.width ?? 0) / 2))).toBeLessThanOrEqual(2);
});
