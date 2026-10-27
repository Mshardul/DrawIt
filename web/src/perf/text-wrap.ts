// Compares wrapped text in three places in the same browser: canvas measurement (what the line
// breaker sees), SVG text, the editing overlay, and the rasterised SVG that PNG export would draw.
import { breakLines } from "../text/wrap.ts";

const SVG_NS = "http://www.w3.org/2000/svg";
const FONT = "16px sans-serif";
const LINE_HEIGHT = 20;
const BASELINE = 15;

export const FIXTURES: Record<string, string> = {
  prose:
    "Orders grew 42% in Q3, driven by the new checkout flow and a smaller, faster cart. Support tickets fell for the second quarter in a row.",
  punctuation: "Well-known (and widely used) tools -- e.g. KDL, SVG, and PNG -- are \"plain\" text: easy, quick, cheap.",
  longWord: "Supercalifragilisticexpialidocious pneumonoultramicroscopicsilicovolcanoconiosis end",
  breaks: "First line\n\nThird line after a blank one, which is long enough to wrap around.",
  unicode: "Café naïve résumé — “quoted” text with 👨‍👩‍👧 emoji and ½ fractions",
  numbers: "1,234,567.89 USD / 2026-10-26 / 12:30pm / #ff00aa / v1.2.3-beta.4",
};
export const WIDTHS = [90, 160, 280];

export interface CaseResult {
  fixture: string;
  width: number;
  lines: string[];
  // Largest difference between the canvas width of a line and its width in SVG text and in the overlay, and
  // between the ink of the rasterised SVG and the ink of the same line drawn on a canvas.
  svgDelta: number;
  overlayDelta: number;
  pngDelta: number;
  // Widest line minus the box width, over all three renderings (above 0 means text sticks out).
  overflow: number;
}

export interface WrapRun {
  font: string;
  cases: CaseResult[];
}

const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("no 2d context");
ctx.font = FONT;
ctx.textRendering = "geometricPrecision";
const measure = (text: string): number => ctx.measureText(text).width;

function drawSvg(lines: string[]): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("xmlns", SVG_NS);
  svg.setAttribute("width", "600");
  svg.setAttribute("height", String(lines.length * LINE_HEIGHT + 4));
  const text = document.createElementNS(SVG_NS, "text");
  text.setAttribute("style", `font: ${FONT}; white-space: pre`);
  text.setAttribute("fill", "#000");
  text.setAttribute("text-rendering", "geometricPrecision");
  lines.forEach((line, i) => {
    const span = document.createElementNS(SVG_NS, "tspan");
    span.setAttribute("x", "0");
    span.setAttribute("y", String(BASELINE + i * LINE_HEIGHT));
    span.textContent = line === "" ? "\u200b" : line;
    text.append(span);
  });
  svg.append(text);
  return svg;
}

function svgWidths(svg: SVGSVGElement): number[] {
  return [...svg.querySelectorAll("tspan")].map((span) => (span.textContent === "\u200b" ? 0 : span.getComputedTextLength()));
}

function overlayWidths(host: HTMLElement, lines: string[]): number[] {
  const overlay = document.createElement("div");
  overlay.id = "overlay";
  overlay.contentEditable = "true";
  overlay.textContent = lines.join("\n");
  host.append(overlay);
  const node = overlay.firstChild;
  const widths: number[] = [];
  if (node) {
    let start = 0;
    for (const line of lines) {
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + line.length);
      widths.push(line === "" ? 0 : range.getBoundingClientRect().width);
      start += line.length + 1;
    }
  }
  overlay.remove();
  return widths;
}

// Ink extent of each line: the rightmost column with any visible pixel inside the line's row band.
function inkWidths(surface: HTMLCanvasElement, lines: string[]): number[] {
  const sctx = surface.getContext("2d", { willReadFrequently: true });
  if (!sctx) throw new Error("no 2d context");
  const { data } = sctx.getImageData(0, 0, surface.width, surface.height);
  return lines.map((_, i) => {
    let right = -1;
    const top = i * LINE_HEIGHT;
    for (let y = top; y < top + LINE_HEIGHT; y++) {
      for (let x = surface.width - 1; x > right; x--) {
        if ((data[(y * surface.width + x) * 4 + 3] ?? 0) > 40) {
          right = x;
          break;
        }
      }
    }
    return right + 1;
  });
}

function newSurface(lines: string[]): HTMLCanvasElement {
  const surface = document.createElement("canvas");
  surface.width = 600;
  surface.height = lines.length * LINE_HEIGHT + 4;
  return surface;
}

// The SVG as PNG export would draw it: loaded as an image and painted on a canvas.
async function rasterWidths(svg: SVGSVGElement, lines: string[]): Promise<number[]> {
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }));
  const image = new Image();
  image.src = url;
  await image.decode();
  URL.revokeObjectURL(url);
  const surface = newSurface(lines);
  surface.getContext("2d")?.drawImage(image, 0, 0);
  return inkWidths(surface, lines);
}

// The same lines drawn straight onto a canvas with the font the line breaker measured.
function canvasInkWidths(lines: string[]): number[] {
  const surface = newSurface(lines);
  const sctx = surface.getContext("2d");
  if (!sctx) throw new Error("no 2d context");
  sctx.font = FONT;
  sctx.textRendering = "geometricPrecision";
  lines.forEach((line, i) => {
    sctx.fillText(line, 0, BASELINE + i * LINE_HEIGHT);
  });
  return inkWidths(surface, lines);
}

const maxDelta = (a: number[], b: number[]): number => Math.max(0, ...a.map((v, i) => Math.abs(v - (b[i] ?? 0))));

export async function runWrap(): Promise<WrapRun> {
  await document.fonts.ready;
  const host = document.getElementById("stage");
  if (!host) throw new Error("no stage");
  const cases: CaseResult[] = [];
  for (const [fixture, text] of Object.entries(FIXTURES)) {
    for (const width of WIDTHS) {
      const lines = breakLines(text, width, measure);
      const expected = lines.map(measure);
      const svg = drawSvg(lines);
      host.append(svg);
      const svgW = svgWidths(svg);
      const overlayW = overlayWidths(host, lines);
      const pngW = await rasterWidths(svg, lines);
      svg.remove();
      cases.push({
        fixture,
        width,
        lines,
        svgDelta: maxDelta(svgW, expected),
        overlayDelta: maxDelta(overlayW, expected),
        pngDelta: maxDelta(pngW, canvasInkWidths(lines)),
        overflow: Math.max(...svgW, ...overlayW, ...pngW) - width,
      });
    }
  }
  return { font: FONT, cases };
}

(window as unknown as { runWrap: typeof runWrap }).runWrap = runWrap;
