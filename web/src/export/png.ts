export const PNG_TOO_LARGE = "Too large for the browser to draw. Use a smaller scale, or export a frame.";

export type PngScale = 1 | 2 | 3;

export type PngExport = { ok: true; blob: Blob } | { ok: false; message: string };

/** Pixel size of an export: the svg's own width and height times the scale, ignoring the page zoom. */
export function rasterSize(svg: string, scale: PngScale): { width: number; height: number } {
  const width = Number(/<svg\b[^>]*\swidth="([0-9.]+)"/.exec(svg)?.[1]);
  const height = Number(/<svg\b[^>]*\sheight="([0-9.]+)"/.exec(svg)?.[1]);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function canvasAccepts(width: number, height: number): boolean {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return false;
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
}

export async function exportPng(svg: string, options: { scale: PngScale; transparent: boolean }): Promise<PngExport> {
  const { width, height } = rasterSize(svg, options.scale);
  if (!canvasAccepts(width, height)) return { ok: false, message: PNG_TOO_LARGE };
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return { ok: false, message: PNG_TOO_LARGE };
    if (!options.transparent) {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/png");
    });
    return blob ? { ok: true, blob } : { ok: false, message: PNG_TOO_LARGE };
  } catch {
    return { ok: false, message: PNG_TOO_LARGE };
  } finally {
    URL.revokeObjectURL(url);
  }
}
