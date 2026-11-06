import { expect, test } from "@playwright/test";

const CSP = "default-src 'self'; connect-src 'self'; img-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";

test.beforeEach(async ({ page }) => {
  await page.route("http://127.0.0.1:5173/", async (route) => {
    const response = await route.fetch();
    const headers = { ...response.headers(), "content-security-policy": CSP };
    await route.fulfill({ status: response.status(), headers, body: await response.body() });
  });
  await page.goto("/");
});

test("png export follows the svg size, keeps a transparent corner, and refuses a canvas the browser cannot draw", async ({ page }) => {
  const report = await page.evaluate(async () => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { exportPng } = await load<typeof import("../src/export/png.ts")>("/src/export/png.ts");
    document.documentElement.style.zoom = "2";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="10" height="10" fill="#000000"/></svg>`;
    const opaque = await exportPng(svg, { scale: 2, transparent: false });
    const clear = await exportPng(svg, { scale: 1, transparent: true });
    const refused = await exportPng(`<svg xmlns="http://www.w3.org/2000/svg" width="30000" height="30000"></svg>`, { scale: 3, transparent: true });
    document.documentElement.style.zoom = "";

    const sample = async (blob: Blob, x: number, y: number): Promise<{ width: number; height: number; pixel: number[] }> => {
      const url = URL.createObjectURL(blob);
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("no canvas");
        context.drawImage(image, 0, 0);
        const pixel = context.getImageData(x, y, 1, 1).data;
        return { width: image.naturalWidth, height: image.naturalHeight, pixel: [...pixel] };
      } finally {
        URL.revokeObjectURL(url);
      }
    };

    return {
      opaque: opaque.ok ? await sample(opaque.blob, 30, 5) : opaque,
      clearCorner: clear.ok ? await sample(clear.blob, 15, 5) : clear,
      clearInk: clear.ok ? await sample(clear.blob, 2, 5) : clear,
      refused,
    };
  });

  expect(report.opaque).toMatchObject({ width: 40, height: 20, pixel: [255, 255, 255, 255] });
  expect(report.clearInk).toMatchObject({ pixel: [0, 0, 0, 255] });
  expect(report.clearCorner).toMatchObject({ width: 20, height: 10, pixel: [0, 0, 0, 0] });
  expect(report.refused).toEqual({
    ok: false,
    message: "Too large for the browser to draw. Use a smaller scale, or export a frame.",
  });
});
