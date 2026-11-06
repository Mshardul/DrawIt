import { expect, test } from "@playwright/test";

// Draws an SVG through an image into a canvas under the app's content security policy.
const CSP = "default-src 'self'; connect-src 'self'; img-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";

interface SpikeReport {
  browser: string;
  transition: { x1: number; x2: number; x3: number };
  sameAtZoom: boolean;
  blobPaintsDataImage: boolean;
  dataSvgPaints: boolean;
  styleAttributePaints: boolean;
  fontDelta: number | null;
  maxSide: number;
  maxSquare: number;
}

test.beforeEach(async ({ page }) => {
  await page.route("http://127.0.0.1:5173/", async (route) => {
    const response = await route.fetch();
    const headers = { ...response.headers(), "content-security-policy": CSP };
    await route.fulfill({ status: response.status(), headers, body: await response.body() });
  });
  await page.goto("/");
});

test("svg drawn to a canvas stays sharp with a blob url @spike", async ({ page, browserName }) => {
  test.skip(browserName === "firefox", "the proof is Chromium and WebKit");
  const report = await page.evaluate(async (browser): Promise<SpikeReport> => {
    const paint = async (svg: string, scale: number): Promise<Uint8ClampedArray | null> => {
      const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.naturalWidth * scale);
        canvas.height = Math.round(image.naturalHeight * scale);
        const context = canvas.getContext("2d");
        if (!context) return null;
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        return context.getImageData(0, 0, canvas.width, canvas.height).data;
      } catch {
        return null;
      } finally {
        URL.revokeObjectURL(url);
      }
    };

    const edge = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="10" height="20" fill="#000000"/></svg>`;
    const transitionAt = (data: Uint8ClampedArray, width: number): number => {
      const y = Math.floor(width / 2);
      let gray = 0;
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const value = data[i] ?? 0;
        if (value > 8 && value < 247) gray++;
      }
      return gray;
    };
    const one = await paint(edge, 1);
    const two = await paint(edge, 2);
    const three = await paint(edge, 3);
    if (!one || !two || !three) throw new Error("edge did not paint");

    document.documentElement.style.zoom = "2";
    const zoomed = await paint(edge, 2);
    document.documentElement.style.zoom = "";
    const sameAtZoom = zoomed !== null && zoomed.length === two.length && zoomed.every((value, index) => value === two[index]);

    const pixel = document.createElement("canvas");
    pixel.width = 2;
    pixel.height = 2;
    const pixelContext = pixel.getContext("2d");
    if (!pixelContext) throw new Error("no canvas");
    pixelContext.fillStyle = "#ff0000";
    pixelContext.fillRect(0, 0, 2, 2);
    const png = pixel.toDataURL("image/png");
    const pictured = `<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><image href="${png}" width="2" height="2"/></svg>`;
    const blobs = await paint(pictured, 1);
    const blobPaintsDataImage = blobs !== null && (blobs[0] ?? 0) > 200 && (blobs[1] ?? 255) < 40;

    let dataSvgPaints = false;
    try {
      const image = new Image();
      image.src = `data:image/svg+xml,${encodeURIComponent(pictured)}`;
      await image.decode();
      dataSvgPaints = image.naturalWidth > 0;
    } catch {
      // A blocked image rejects. dataSvgPaints stays false.
    }

    const styled = `<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="#00ff00" style="fill:#ff0000"/></svg>`;
    const styledData = await paint(styled, 1);
    const styleAttributePaints = styledData !== null && (styledData[0] ?? 0) > 200;

    const blocked = document.createElement("div");
    blocked.setAttribute("style", "color: rgb(255, 0, 0)");
    document.body.append(blocked);
    const inlineBlocked = getComputedStyle(blocked).color !== "rgb(255, 0, 0)";
    blocked.remove();

    let fontDelta: number | null = null;
    const response = await fetch("/node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2");
    if (response.ok) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      const face = `data:font/woff2;base64,${btoa(binary)}`;
      const word = "MMMM";
      const fonted = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40"><style>@font-face{font-family:Embed;src:url(${face}) format("woff2");}</style><text x="0" y="30" font-family="Embed" font-size="32">${word}</text></svg>`;
      const ink = await paint(fonted, 1);
      const sample = document.createElement("canvas");
      sample.width = 200;
      sample.height = 40;
      const sampleContext = sample.getContext("2d");
      if (ink && sampleContext) {
        await document.fonts.load('32px Inter');
        sampleContext.font = "32px Inter";
        sampleContext.fillText(word, 0, 30);
        const expected = sampleContext.measureText(word).width;
        let right = 0;
        for (let x = 0; x < 200; x++) {
          for (let y = 0; y < 40; y++) if ((ink[(y * 200 + x) * 4 + 3] ?? 0) > 20) right = x;
        }
        fontDelta = Math.abs(right - expected);
      }
    }

    const canDraw = (width: number, height: number): boolean => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        if (canvas.width !== width || canvas.height !== height) return false;
        const context = canvas.getContext("2d");
        if (!context) return false;
        context.fillRect(0, 0, 1, 1);
        return context.getImageData(0, 0, 1, 1).data.length === 4;
      } catch {
        return false;
      }
    };
    const largest = (heightFor: (side: number) => number): number => {
      let side = 1024;
      let ok = 0;
      while (side <= 16384 && canDraw(side, heightFor(side))) {
        ok = side;
        side *= 2;
      }
      return ok;
    };

    return {
      browser,
      transition: { x1: transitionAt(one, 20), x2: transitionAt(two, 40), x3: transitionAt(three, 60) },
      sameAtZoom,
      blobPaintsDataImage,
      dataSvgPaints,
      styleAttributePaints: styleAttributePaints && inlineBlocked,
      fontDelta,
      maxSide: largest(() => 1),
      maxSquare: largest((side) => side),
    };
  }, browserName);

  expect(report.transition).toEqual({ x1: 0, x2: 0, x3: 0 });
  expect(report.sameAtZoom).toBe(true);
  expect(report.blobPaintsDataImage).toBe(true);
  expect(report.dataSvgPaints).toBe(false);
  expect(report.styleAttributePaints).toBe(true);
  expect(report.fontDelta).not.toBeNull();
  expect(report.fontDelta ?? 999).toBeLessThan(8);
  expect(report.maxSide).toBeGreaterThanOrEqual(8192);
  expect(report.maxSquare).toBeGreaterThanOrEqual(4096);
  test.info().annotations.push({ type: "spike", description: JSON.stringify(report) });
});
