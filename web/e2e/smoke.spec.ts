import { expect, test } from "@playwright/test";

test("[T-001] the app loads in every browser", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("DrawIt");
  await expect(page.locator("#app")).toHaveText("DrawIt");
});
