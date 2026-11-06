import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const CSP = "default-src 'self'; connect-src 'self'; img-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";

const file = `diagram version=1 title="Plan"

frame overview "Overview"
node inside "In" shape=rect
node away "Out" shape=rect

layout {
  overview x=0 y=0 w=220 h=140
  inside x=20 y=20 w=80 h=40
  away x=500 y=500 w=80 h=40
}
`;

test.beforeEach(async ({ page }) => {
  await page.route("http://127.0.0.1:5173/", async (route) => {
    const response = await route.fetch();
    const headers = { ...response.headers(), "content-security-policy": CSP };
    await route.fulfill({ status: response.status(), headers, body: await response.body() });
  });
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.goto("/");
  await page.evaluate(async (text) => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { mountShell } = await load<typeof import("../src/testing/mount-shell.ts")>("/src/testing/mount-shell.ts");
    await mountShell({ "plan.drawit.kdl": text });
  }, file);
});

test("export downloads a frame as a file named after the diagram and the frame", async ({ page }) => {
  await page.getByRole("button", { name: "Export" }).click();
  const dialog = page.getByRole("dialog", { name: "Export" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("radio", { name: "Whole canvas" })).toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: "Transparent background" })).toBeChecked();
  await expect(dialog.locator(".file-name")).toHaveText("plan.png");
  await expect(dialog.locator(".muted").last()).toContainText("PNG at 1x:");

  await dialog.getByRole("button", { name: "2x" }).click();
  await expect(dialog.locator(".muted").last()).toContainText("PNG at 2x:");

  await dialog.getByRole("radio", { name: "Frame: Overview" }).check();
  await expect(dialog.locator(".file-name")).toHaveText("plan-overview.png");
  await dialog.getByRole("button", { name: "SVG", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "2x" })).toBeDisabled();
  await expect(dialog.locator(".file-name")).toHaveText("plan-overview.svg");
  await expect(dialog.getByRole("img", { name: "Preview" })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("plan-overview.svg");
  const path = await download.path();
  if (!path) throw new Error("download was blocked");
  const svg = readFileSync(path, "utf8");
  expect(svg).toContain('clip-path="url(#frame-region)"');
  expect(svg).toContain(">Overview<");
  expect(svg).toContain('data-id="inside"');
  expect(svg).not.toContain('data-id="away"');
  expect(svg).toContain("font-family:'Inter'");
});
