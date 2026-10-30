import { expect, test } from "@playwright/test";

// The live catalogue page shows every shape of every pack, found from the pack files.
test("shows a thumbnail and the full name of every bundled shape, and no problems", async ({ page }) => {
  await page.goto("/catalogue.html");
  const expected = await page.evaluate(async () => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { bundledLoader } = await load<typeof import("../src/shapes/bundled-packs.ts")>("/src/shapes/bundled-packs.ts");
    return bundledLoader.shapes().map((s) => s.name);
  });
  expect(expected.length).toBeGreaterThan(50);
  await expect(page.locator("figure")).toHaveCount(expected.length);
  for (const name of ["core.rounded-rect", "arch.browser", "c4.boundary", "info.ribbon"]) {
    await expect(page.locator(`figure[data-shape="${name}"] figcaption`)).toHaveText(name);
    await expect(page.locator(`figure[data-shape="${name}"] svg`)).toBeVisible();
  }
  await expect(page.locator(".problems")).toHaveCount(0);
});

test("groups the shapes under their categories", async ({ page }) => {
  await page.goto("/catalogue.html");
  await expect(page.locator("h2")).toHaveText(["Basic", "Flowchart", "Architecture (generic)", "Network", "C4", "Infographic", "Arrows and lines"]);
});
