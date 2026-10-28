import { test } from "@playwright/test";

// The CI runner has no GPU and rasterises WebKit in software at 2x device pixels, so a drag that
// moves many shapes costs 30-45ms per frame there while script time stays under 1ms. The same
// drag holds 60fps in WebKit on a development machine, and in Chromium and Firefox on CI.
export function skipFrameBudgetOnCiWebkit(browserName: string): void {
  test.skip(browserName === "webkit" && !!process.env["CI"], "software-rasterised WebKit on CI cannot hold the frame budget");
}
