import { expect, test, type Page } from "@playwright/test";

// Images in the real shell over an in-memory workspace.
const file = `diagram version=1

image natural src="assets/pic.png"
image sized src="assets/pic.png"
image vector src="assets/shape.svg"
image missing src="assets/missing.png"
image outside src="../outside.png"

layout {
  natural x=50 y=50
  sized x=300 y=50 w=100 h=100
  vector x=500 y=50
  missing x=50 y=300 w=200 h=100
  outside x=300 y=300 w=200 h=100
}
`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="#e8732a"/></svg>`;

interface Hooks {
  selection(): string[];
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 700 });
  await page.goto("/");
  await page.evaluate(
    async ({ text, vector }) => {
      const load = <T>(path: string) => import(path) as Promise<T>;
      const { startShell } = await load<typeof import("../src/app/shell.ts")>("/src/app/shell.ts");
      const { MemoryStorage } = await load<typeof import("../src/storage/memory.ts")>("/src/storage/memory.ts");
      const canvas = document.createElement("canvas");
      canvas.width = 40;
      canvas.height = 20;
      const context = canvas.getContext("2d");
      if (context) {
        context.fillStyle = "#1f4e79";
        context.fillRect(0, 0, 40, 20);
      }
      const png = await new Promise<Blob | null>((resolve) => { canvas.toBlob(resolve, "image/png"); });
      const bytes = new Uint8Array(await (png as Blob).arrayBuffer());
      const shell = await startShell(
        document.getElementById("app") as HTMLElement,
        new MemoryStorage({ "a.drawit.kdl": text, "assets/pic.png": bytes, "assets/shape.svg": vector }),
      );
      shell.setView({ x: 0, y: 0, scale: 1 });
      (window as unknown as { hooks: Hooks }).hooks = { selection: () => shell.file?.history.selection ?? [] };
    },
    { text: file, vector: svg },
  );
});

const selection = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as { hooks: Hooks }).hooks.selection());
const image = (page: Page, id: string) => page.locator(`g[data-id="${id}"] image`);

test("an image with no size is drawn from its file at the file's size", async ({ page }) => {
  await expect(image(page, "natural")).toHaveAttribute("href", /^blob:/);
  await expect(image(page, "natural")).toHaveAttribute("width", "40");
  await expect(image(page, "natural")).toHaveAttribute("height", "20");
});

test("an image with a size is drawn at that size, and an SVG file works too", async ({ page }) => {
  await expect(image(page, "sized")).toHaveAttribute("width", "100");
  await expect(image(page, "sized")).toHaveAttribute("height", "100");
  await expect(image(page, "vector")).toHaveAttribute("width", "120");
  await expect(image(page, "vector")).toHaveAttribute("height", "60");
});

test("the blob URL on the canvas holds the file's pixels", async ({ page }) => {
  await expect(image(page, "natural")).toHaveAttribute("href", /^blob:/);
  const loaded = await page.evaluate(async () => {
    const href = document.querySelector('g[data-id="natural"] image')?.getAttribute("href") ?? "";
    const img = new Image();
    img.src = href;
    await img.decode();
    return [img.naturalWidth, img.naturalHeight];
  });
  expect(loaded).toEqual([40, 20]);
});

test("a file that is missing, or outside the folder, is a dashed placeholder showing its path", async ({ page }) => {
  await expect(page.locator('g[data-id="missing"] text')).toHaveText("assets/missing.png");
  await expect(page.locator('g[data-id="missing"] rect')).toHaveAttribute("stroke-dasharray", "6 4");
  await expect(page.locator('g[data-id="outside"] text')).toHaveText("../outside.png");
  await expect(page.locator('g[data-id="missing"] image')).toHaveCount(0);
});

test("clicking an image selects it", async ({ page }) => {
  const canvas = await page.locator(".canvas").boundingBox();
  await page.mouse.click((canvas?.x ?? 0) + 70, (canvas?.y ?? 0) + 60);
  expect(await selection(page)).toEqual(["natural"]);
});
