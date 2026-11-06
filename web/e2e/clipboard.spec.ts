import { expect, test, type Page } from "@playwright/test";

// Copy, cut and paste in the real shell. The copy event is checked in every browser, WebKit included.
const file = `diagram version=1

node a "Alpha" shape=rect
node b "Beta" shape=rect

layout {
  a x=40 y=40 w=100 h=50
  b x=240 y=40 w=100 h=50 locked=#true
}
`;

interface Hooks {
  ids(): string[];
  select(ids: string[]): void;
  layout(id: string): { x: number; y: number } | null;
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 700 });
  await page.goto("/");
  await page.evaluate(async (text) => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { mountShell } = await load<typeof import("../src/testing/mount-shell.ts")>("/src/testing/mount-shell.ts");
    const { shell } = await mountShell({ "a.drawit.kdl": text });
    shell.setView({ x: 0, y: 0, scale: 1 });
    (window as unknown as { hooks: Hooks }).hooks = {
      ids: () => shell.file?.document.elements.map((element) => element.id) ?? [],
      select: (ids) => {
        if (shell.file) shell.file.history.selection = ids;
        shell.refresh();
      },
      layout: (id) => {
        const entry = shell.file?.document.layout.find((item) => item.id === id);
        return entry ? { x: entry.x, y: entry.y } : null;
      },
    };
  }, file);
});

const ids = (page: Page): Promise<string[]> => page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.ids());
const select = (page: Page, picked: string[]): Promise<void> =>
  page.evaluate((picked) => { (window as unknown as { hooks: Hooks }).hooks.select(picked); }, picked);

async function clipboard(page: Page, type: "copy" | "cut" | "paste", text = ""): Promise<string> {
  return page.evaluate(({ type, text }) => {
    let written = "";
    const transfer = new DataTransfer();
    if (text) transfer.setData("text/plain", text);
    const grab = (event: ClipboardEvent): void => {
      written = event.clipboardData?.getData("text/plain") ?? "";
    };
    addEventListener(type, grab);
    dispatchEvent(new ClipboardEvent(type, { clipboardData: transfer, bubbles: true, cancelable: true }));
    removeEventListener(type, grab);
    return written;
  }, { type, text });
}

test("a copy event writes the selection as a DrawIt document", async ({ page }) => {
  await select(page, ["a"]);
  const text = await clipboard(page, "copy");
  expect(text.startsWith("diagram version=1")).toBe(true);
  expect(text).toContain("node a");
  expect(text).not.toContain("node b");
});

test("paste of that document offsets the copy, and other text is ignored", async ({ page }) => {
  await select(page, ["a"]);
  const text = await clipboard(page, "copy");
  await clipboard(page, "paste", "hello");
  expect(await ids(page)).toEqual(["a", "b"]);
  await clipboard(page, "paste", text);
  expect(await ids(page)).toEqual(["a", "b", "rect"]);
  const at = await page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.layout("rect"));
  expect(at).toEqual({ x: 56, y: 56 });
});

test("cut removes the unlocked element in one undo and leaves the locked one", async ({ page }) => {
  await select(page, ["a", "b"]);
  const text = await clipboard(page, "cut");
  expect(text).toContain("node a");
  expect(text).toContain("node b");
  expect(await ids(page)).toEqual(["b"]);
  await page.keyboard.press("ControlOrMeta+z");
  expect(await ids(page)).toEqual(["a", "b"]);
});
