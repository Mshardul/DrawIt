import { expect, test } from "@playwright/test";

// `startShell` loads the bundled fonts before it draws, so text is never measured in a fallback font.
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { startShell } = await load<typeof import("../src/app/shell.ts")>("/src/app/shell.ts");
    const { MemoryStorage } = await load<typeof import("../src/storage/memory.ts")>("/src/storage/memory.ts");
    await startShell(document.getElementById("app") as HTMLElement, new MemoryStorage({}));
  });
});

test("every bundled face is loaded once the shell has started", async ({ page }) => {
  const faces = await page.evaluate(() => [...document.fonts].map((f) => ({ family: f.family, status: f.status })));
  expect(faces).toHaveLength(36);
  expect(faces.filter((f) => f.status !== "loaded")).toEqual([]);
  expect([...new Set(faces.map((f) => f.family.replaceAll('"', "")))].toSorted()).toEqual(["Inter", "JetBrains Mono", "Source Serif 4"]);
});

test("each family and weight draws with its own face in Latin, Greek and Cyrillic", async ({ page }) => {
  const widths = await page.evaluate(() => {
    const ctx = document.createElement("canvas").getContext("2d") as CanvasRenderingContext2D;
    const samples = ["Wiggle", "Ωμέγα", "Привет"];
    const out: Record<string, number[]> = {};
    for (const family of ["Inter", "Source Serif 4", "JetBrains Mono"]) {
      for (const style of ["400", "700", "italic 400"]) {
        ctx.font = `${style} 20px "${family}"`;
        out[`${family} ${style}`] = samples.map((s) => ctx.measureText(s).width);
      }
    }
    return out;
  });
  for (const style of ["400", "700", "italic 400"]) {
    const [inter, serif, mono] = ["Inter", "Source Serif 4", "JetBrains Mono"].map((f) => widths[`${f} ${style}`] ?? []);
    for (const n of [0, 1, 2]) {
      expect(new Set([inter?.[n], serif?.[n], mono?.[n]]).size, `${style} sample ${String(n)}`).toBe(3);
    }
  }
  // A monospace face has one advance in every weight, so only the proportional families tell regular from bold.
  for (const family of ["Inter", "Source Serif 4"]) {
    for (const n of [0, 1, 2]) {
      expect(widths[`${family} 400`]?.[n], `${family} bold sample ${String(n)}`).not.toBe(widths[`${family} 700`]?.[n]);
    }
  }
});
