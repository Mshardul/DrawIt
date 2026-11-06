import type { DiagramDocument } from "../model/index.ts";
import type { ImageLookup } from "../render/images.ts";
import type { TextMeasurer } from "../text/measure.ts";
import { embeddedFonts } from "./fonts.ts";
import { imageHrefs } from "./images.ts";
import { exportFileName } from "./name.ts";
import { exportPng, PNG_TOO_LARGE, rasterSize, type PngScale } from "./png.ts";
import { exportedIds, exportSvg } from "./svg.ts";

export interface ExportBuild {
  doc: DiagramDocument;
  measurer: TextMeasurer;
  diagramPath: string;
  images: ImageLookup;
  storage: { read(path: string): Promise<Uint8Array> };
  readFont: (url: string) => Promise<Uint8Array>;
  selection: readonly string[];
  scope: "canvas" | "selection" | "frame";
  frameId?: string;
  format: "svg" | "png";
  scale: PngScale;
  transparent: boolean;
}

export interface BuiltExport {
  name: string;
  svg: string;
  blob: Blob | null;
  summary: string;
  message: string;
}

function grouped(n: number): string {
  return n.toLocaleString("en-US");
}

export async function buildExport(input: ExportBuild): Promise<BuiltExport> {
  const frame = input.scope === "frame" ? input.frameId : undefined;
  const ids = input.scope === "selection" ? new Set(input.selection) : undefined;
  const images = input.images;
  const only = exportedIds(input.doc, input.measurer, images, { ...(ids && { ids }), ...(frame && { frame }) });
  const [fonts, hrefs] = await Promise.all([
    embeddedFonts(input.doc, only, input.readFont),
    imageHrefs(input.doc, input.diagramPath, input.storage, only),
  ]);
  const svg = exportSvg(input.doc, input.measurer, {
    title: input.doc.title ?? "Diagram",
    description: input.diagramPath,
    images,
    imageHrefs: hrefs,
    fonts,
    ...(ids && { ids }),
    ...(frame && { frame }),
  });
  const shown = input.format === "png" ? rasterSize(svg, input.scale) : rasterSize(svg, 1);
  const summary = input.format === "png"
    ? `PNG at ${String(input.scale)}x: ${grouped(shown.width)} × ${grouped(shown.height)} px`
    : `SVG: ${grouped(shown.width)} × ${grouped(shown.height)} px`;
  const name = exportFileName(input.diagramPath, frame ?? null, input.format);
  if (input.format === "svg") {
    return { name, svg, blob: new Blob([svg], { type: "image/svg+xml" }), summary, message: "" };
  }
  const png = await exportPng(svg, { scale: input.scale, transparent: input.transparent });
  if (!png.ok) return { name, svg, blob: null, summary, message: png.message || PNG_TOO_LARGE };
  return { name, svg, blob: png.blob, summary, message: "" };
}
