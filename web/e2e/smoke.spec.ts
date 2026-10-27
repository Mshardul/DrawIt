import { expect, test } from "@playwright/test";

test("the app loads in every browser", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("DrawIt");
  await expect(page.locator("#app")).toContainText("DrawIt");
});
