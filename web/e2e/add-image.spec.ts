import { expect, test, type Page } from "@playwright/test";

// Dropping and pasting image files in the real shell over an in-memory workspace.
const file = `diagram version=1

node a "Alpha" shape=rect

layout {
  a x=40 y=40 w=100 h=50
}
`;

interface Hooks {
  selection(): string[];
  images(): { id: string; src: string }[];
  layout(id: string): { x: number; y: number; w?: number; h?: number } | undefined;
  files(): Promise<string[]>;
  undo(): void;
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 700 });
  await page.goto("/");
  await page.evaluate(async (text) => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { mountShell } = await load<typeof import("../src/testing/mount-shell.ts")>("/src/testing/mount-shell.ts");
    const { shell, storage } = await mountShell({ "a.drawit.kdl": text });
    shell.setView({ x: 0, y: 0, scale: 1 });
    (window as unknown as { hooks: Hooks }).hooks = {
      selection: () => shell.file?.history.selection ?? [],
      images: () => (shell.file?.document.elements ?? []).flatMap((e) => (e.kind === "image" ? [{ id: e.id, src: e.src }] : [])),
      layout: (id) => shell.file?.document.layout.find((e) => e.id === id),
      files: async () => (await storage.list()).map((f) => f.path),
      undo: () => {
        shell.file?.history.undo();
        shell.refresh();
      },
    };
  }, file);
});

const hooks = <T>(page: Page, run: (h: Hooks) => T): Promise<T> => page.evaluate<T>(`(${run.toString()})(window.hooks)`);

/** Drops a generated PNG, or a text file, on the canvas at a screen point. */
async function drop(page: Page, at: { x: number; y: number }, what: { name: string; w?: number; h?: number; text?: string }): Promise<void> {
  await page.evaluate(
    async ({ at, what }) => {
      const canvas = document.querySelector(".canvas") as Element;
      const box = canvas.getBoundingClientRect();
      const transfer = new DataTransfer();
      if (what.text !== undefined) {
        transfer.items.add(new File([what.text], what.name, { type: "text/plain" }));
      } else {
        const c = document.createElement("canvas");
        c.width = what.w ?? 40;
        c.height = what.h ?? 20;
        c.getContext("2d")?.fillRect(0, 0, c.width, c.height);
        const blob = await new Promise<Blob | null>((resolve) => { c.toBlob(resolve, "image/png"); });
        transfer.items.add(new File([blob as Blob], what.name, { type: "image/png" }));
      }
      canvas.dispatchEvent(new DragEvent("drop", { dataTransfer: transfer, clientX: box.left + at.x, clientY: box.top + at.y, bubbles: true, cancelable: true }));
    },
    { at, what },
  );
}

test("dropping an image saves it in assets and adds it at its size, centred on the drop, selected", async ({ page }) => {
  await drop(page, { x: 500, y: 300 }, { name: "Logo.png" });
  await expect.poll(() => hooks(page, (h) => h.images())).toEqual([{ id: "logo", src: "assets/logo.png" }]);
  expect(await hooks(page, (h) => h.layout("logo"))).toEqual({ id: "logo", x: 480, y: 290, w: 40, h: 20 });
  expect(await hooks(page, (h) => h.selection())).toEqual(["logo"]);
  expect(await hooks(page, (h) => h.files())).toContain("assets/logo.png");
  await expect(page.locator('g[data-id="logo"] image')).toHaveAttribute("href", /^blob:/);
});

test("a second image with the same name gets another name and another ID", async ({ page }) => {
  await drop(page, { x: 300, y: 300 }, { name: "logo.png" });
  await expect.poll(() => hooks(page, (h) => h.images().length)).toBe(1);
  await drop(page, { x: 600, y: 300 }, { name: "logo.png" });
  await expect.poll(() => hooks(page, (h) => h.images().length)).toBe(2);
  expect(await hooks(page, (h) => h.images())).toEqual([
    { id: "logo", src: "assets/logo.png" },
    { id: "logo-2", src: "assets/logo-2.png" },
  ]);
});

test("a large image is capped to the visible canvas, keeping its shape", async ({ page }) => {
  // The style panel opens once the new image is selected, which narrows the canvas, so measure first.
  const canvas = await page.locator(".canvas").boundingBox();
  await drop(page, { x: 400, y: 300 }, { name: "big.png", w: 4000, h: 2000 });
  await expect.poll(() => hooks(page, (h) => h.images().length)).toBe(1);
  const size = await hooks(page, (h) => h.layout("big"));
  expect(size?.w ?? 0).toBeLessThanOrEqual(canvas?.width ?? 0);
  expect(size?.h ?? 0).toBeLessThanOrEqual(canvas?.height ?? 0);
  expect((size?.w ?? 0) / (size?.h ?? 1)).toBeCloseTo(2, 1);
});

test("adding an image is one undo step", async ({ page }) => {
  await drop(page, { x: 500, y: 300 }, { name: "logo.png" });
  await expect.poll(() => hooks(page, (h) => h.images().length)).toBe(1);
  await hooks(page, (h) => { h.undo(); });
  expect(await hooks(page, (h) => h.images())).toEqual([]);
});

test("pasting an image places it at the centre of the canvas", async ({ page }) => {
  const canvas = await page.locator(".canvas").boundingBox();
  await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 60;
    c.height = 30;
    c.getContext("2d")?.fillRect(0, 0, 60, 30);
    const blob = await new Promise<Blob | null>((resolve) => { c.toBlob(resolve, "image/png"); });
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob as Blob], "image.png", { type: "image/png" }));
    window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
  });
  await expect.poll(() => hooks(page, (h) => h.images())).toEqual([{ id: "image", src: "assets/image.png" }]);
  const at = await hooks(page, (h) => h.layout("image"));
  expect((at?.x ?? 0) + 30).toBeCloseTo((canvas?.width ?? 0) / 2, 0);
  expect((at?.y ?? 0) + 15).toBeCloseTo((canvas?.height ?? 0) / 2, 0);
});

test("a file that is not an image is refused with a message and adds nothing", async ({ page }) => {
  await drop(page, { x: 500, y: 300 }, { name: "notes.txt", text: "hello" });
  await expect(page.getByRole("alert")).toContainText("notes.txt is not a supported image");
  expect(await hooks(page, (h) => h.images())).toEqual([]);
  expect(await hooks(page, (h) => h.files())).toEqual(["a.drawit.kdl"]);
});
