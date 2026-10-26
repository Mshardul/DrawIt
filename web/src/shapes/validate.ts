// The shape pack validator (spec 3): schema, allowed SVG elements and attributes, no literal
// colours, a closed outline, anchors and label inside the shape's bounds, valid cut lines. It
// reports every problem it finds so an author fixes a pack in one pass.
import { flatten, parsePath, pointOnOutline, type Polyline } from "./path.ts";
import { parseSvg, type SvgEl } from "./svg.ts";
import { CATEGORIES, DESIGN_GRID, type Problem, type ProblemCode, type Rect, type Size, type Stretch } from "./types.ts";

const ID = /^[a-z][a-z0-9_-]*$/;
const TAG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const FILE = /^[a-z0-9][a-z0-9_-]*\.svg$/;
/** How far (design px) an anchor may be from the outline. */
const ON_OUTLINE = 0.5;

const ALLOWED: Record<string, string[]> = {
  path: ["d"],
  rect: ["x", "y", "width", "height", "rx", "ry"],
  circle: ["cx", "cy", "r"],
  ellipse: ["cx", "cy", "rx", "ry"],
  polygon: ["points"],
  polyline: ["points"],
  line: ["x1", "y1", "x2", "y2"],
  g: [],
};
const ROLES = ["fill", "stroke", "detail"];
const COLOUR_ATTRS = ["fill", "stroke", "style", "color", "stop-color", "flood-color"];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isPoint = (v: unknown): v is { x: number; y: number } => isObj(v) && isNum(v["x"]) && isNum(v["y"]);

export function validatePack(manifest: unknown, readSvg: (file: string) => string | undefined): Problem[] {
  const problems: Problem[] = [];
  if (!isObj(manifest)) return [{ pack: "?", code: "schema", message: "pack.json must be an object" }];
  const pack = typeof manifest["pack"] === "string" ? manifest["pack"] : "?";
  const add = (code: ProblemCode, message: string, shape?: string): void => {
    problems.push(shape === undefined ? { pack, code, message } : { pack, shape, code, message });
  };
  if (typeof manifest["pack"] !== "string" || !ID.test(manifest["pack"])) add("schema", `pack must match ${String(ID)}`);
  if (!Number.isInteger(manifest["version"]) || (manifest["version"] as number) < 1) add("schema", "version must be a whole number from 1");
  const shapes = manifest["shapes"];
  if (!Array.isArray(shapes) || shapes.length === 0) {
    add("schema", "shapes must be a non-empty list");
    return problems;
  }
  const seen = new Set<string>();
  for (const raw of shapes as unknown[]) {
    const id = isObj(raw) && typeof raw["id"] === "string" ? raw["id"] : "?";
    if (seen.has(id)) add("schema", `duplicate shape id ${id}`, id);
    seen.add(id);
    validateShape(raw, id, (code, message) => { add(code, message, id); }, readSvg);
  }
  return problems;
}

type Report = (code: ProblemCode, message: string) => void;

function validateShape(raw: unknown, id: string, report: Report, readSvg: (file: string) => string | undefined): void {
  if (!isObj(raw)) {
    report("schema", "a shape must be an object");
    return;
  }
  const before = { count: 0 };
  const schema: Report = (code, message) => {
    before.count++;
    report(code, message);
  };
  if (!ID.test(id)) schema("schema", `id must match ${String(ID)}`);
  if (typeof raw["name"] !== "string" || raw["name"] === "") schema("schema", "name must be a non-empty string");
  if (typeof raw["category"] !== "string" || !CATEGORIES.includes(raw["category"])) schema("schema", `category must be one of: ${CATEGORIES.join(", ")}`);
  const tags = raw["tags"];
  if (!Array.isArray(tags) || tags.length === 0 || !tags.every((t) => typeof t === "string" && TAG.test(t))) {
    schema("schema", "tags must be a non-empty list of lowercase words");
  }
  const file = raw["svg"];
  if (typeof file !== "string" || !FILE.test(file)) schema("schema", "svg must be a file name ending in .svg");
  const size = raw["size"];
  if (!isObj(size) || !Number.isInteger(size["w"]) || !Number.isInteger(size["h"]) || (size["w"] as number) <= 0 || (size["h"] as number) <= 0) {
    schema("schema", "size must be { w, h } in whole pixels");
  }
  if (typeof raw["keepAspect"] !== "boolean") schema("schema", "keepAspect must be true or false");
  if (typeof raw["outline"] !== "string" || raw["outline"] === "") schema("schema", "outline must be a path string");
  const anchors = raw["anchors"];
  const sides = ["top", "right", "bottom", "left"];
  if (!isObj(anchors) || !sides.every((s) => isPoint(anchors[s])) || (anchors["extra"] !== undefined && !(Array.isArray(anchors["extra"]) && anchors["extra"].every(isPoint)))) {
    schema("schema", "anchors must give top, right, bottom and left as { x, y }, and optionally extra: a list of them");
  }
  const label = raw["label"];
  if (!isObj(label) || !["x", "y", "w", "h"].every((k) => isNum(label[k]))) schema("schema", "label must be { x, y, w, h }");
  if (before.count > 0) return;

  const dims = size as Size;
  const w = dims.w;
  const h = dims.h;
  if (w % DESIGN_GRID !== 0 || h % DESIGN_GRID !== 0) report("size", `default size ${String(w)}x${String(h)} must be a multiple of ${String(DESIGN_GRID)}`);

  const stretch = checkStretch(raw["stretch"], raw["keepAspect"] === true, dims, report);
  const poly = checkOutline(raw["outline"] as string, report);
  const a = anchors as { top: { x: number; y: number }; right: { x: number; y: number }; bottom: { x: number; y: number }; left: { x: number; y: number }; extra?: { x: number; y: number }[] };
  const named: [string, { x: number; y: number }][] = [...sides.map((s): [string, { x: number; y: number }] => [s, a[s as "top"]]), ...(a.extra ?? []).map((p, i): [string, { x: number; y: number }] => [`extra ${String(i + 1)}`, p])];
  for (const [name, p] of named) {
    if (p.x < 0 || p.y < 0 || p.x > w || p.y > h) report("anchor", `anchor ${name} (${String(p.x)}, ${String(p.y)}) is outside the shape's bounds`);
    else if (poly && !pointOnOutline(poly, p, ON_OUTLINE)) report("anchor", `anchor ${name} (${String(p.x)}, ${String(p.y)}) is not on the outline`);
  }
  const l = label as Rect;
  if (l.w <= 0 || l.h <= 0 || l.x < 0 || l.y < 0 || l.x + l.w > w || l.y + l.h > h) report("label", "label must be a rectangle with a size, inside the shape's bounds");

  const text = readSvg(file as string);
  if (text === undefined) {
    report("svg-missing", `${file as string} not found in the pack folder`);
    return;
  }
  checkSvg(text, dims, stretch, report);
}

function checkStretch(raw: unknown, keepAspect: boolean, size: Size, report: Report): Stretch | undefined {
  if (raw === undefined) return undefined;
  if (!isObj(raw)) {
    report("stretch", "stretch must be { x: [a, b], y: [a, b] }");
    return undefined;
  }
  const out: Stretch = {};
  for (const key of Object.keys(raw)) {
    if (key !== "x" && key !== "y") {
      report("stretch", `stretch has unknown axis ${key}`);
      continue;
    }
    const cuts = raw[key];
    const extent = key === "x" ? size.w : size.h;
    if (!Array.isArray(cuts) || cuts.length !== 2 || !cuts.every(isNum)) report("stretch", `stretch.${key} needs exactly two cut lines`);
    else {
      const [a, b] = cuts as [number, number];
      if (!(a > 0 && a < b && b < extent)) report("stretch", `stretch.${key} cut lines must satisfy 0 < first < second < ${String(extent)}`);
      else out[key] = [a, b];
    }
  }
  if (keepAspect && Object.keys(raw).length > 0) report("stretch", "a keep-aspect shape has no cut lines");
  return out;
}

function checkOutline(d: string, report: Report): Polyline | undefined {
  try {
    const poly = flatten(parsePath(d));
    if (poly.subpaths !== 1 || !poly.closed) {
      report("outline", "the outline must be one closed path (a single M, ending in Z)");
      return undefined;
    }
    return poly;
  } catch (e) {
    report("outline", e instanceof Error ? e.message : String(e));
    return undefined;
  }
}

function checkSvg(text: string, size: Size, stretch: Stretch | undefined, report: Report): void {
  let root: SvgEl;
  try {
    root = parseSvg(text);
  } catch (e) {
    report("svg-parse", e instanceof Error ? e.message : String(e));
    return;
  }
  if (root.tag !== "svg") report("svg-element", `the root element must be <svg>, got <${root.tag}>`);
  for (const name of Object.keys(root.attrs)) if (name !== "xmlns" && name !== "viewBox") report("svg-attribute", `attribute ${name} is not allowed on <svg>`);
  const viewBox = (root.attrs["viewBox"] ?? "").trim().split(/\s+/).join(" ");
  if (viewBox !== `0 0 ${String(size.w)} ${String(size.h)}`) report("size", `viewBox must be "0 0 ${String(size.w)} ${String(size.h)}", the default size`);
  for (const child of root.children) checkElement(child, size, stretch, report);
}

function checkElement(el: SvgEl, size: Size, stretch: Stretch | undefined, report: Report): void {
  const allowed = ALLOWED[el.tag];
  if (!allowed) {
    report("svg-element", `<${el.tag}> is not allowed; use path, rect, circle, ellipse, polygon, line, polyline or g`);
    return;
  }
  for (const name of Object.keys(el.attrs)) {
    if (name === "data-role" || allowed.includes(name)) continue;
    if (COLOUR_ATTRS.includes(name)) report("svg-attribute", `${name} sets a literal colour or style on <${el.tag}>; use data-role and let the theme colour it`);
    else if (name === "stroke-width" || name === "opacity" || name === "class") report("svg-attribute", `${name} is not allowed on <${el.tag}>; appearance comes from the theme and style`);
    else report("svg-attribute", `attribute ${name} is not allowed on <${el.tag}>`);
  }
  if (el.tag !== "g") {
    const role = el.attrs["data-role"];
    if (role === undefined || !ROLES.includes(role)) report("svg-role", `<${el.tag}> needs data-role of ${ROLES.join(", ")}`);
  }
  if (el.tag === "path") {
    try {
      parsePath(el.attrs["d"] ?? "");
    } catch (e) {
      report("svg-path", e instanceof Error ? e.message : String(e));
    }
  }
  if ((el.tag === "circle" || el.tag === "ellipse") && stretch) checkRound(el, size, stretch, report);
  for (const child of el.children) checkElement(child, size, stretch, report);
}

/** A circle or ellipse is redrawn from its centre and radii, so it must sit inside one stretch zone on each axis. */
function checkRound(el: SvgEl, size: Size, stretch: Stretch, report: Report): void {
  const n = (k: string): number => Number(el.attrs[k]);
  const rx = el.tag === "circle" ? n("r") : n("rx");
  const ry = el.tag === "circle" ? n("r") : n("ry");
  for (const [axis, c, r, extent] of [["x", n("cx"), rx, size.w], ["y", n("cy"), ry, size.h]] as const) {
    const cuts = stretch[axis];
    if (!cuts || !Number.isFinite(c) || !Number.isFinite(r)) continue;
    const zones: [number, number][] = [[0, cuts[0]], cuts, [cuts[1], extent]];
    if (!zones.some(([lo, hi]) => c - r >= lo && c + r <= hi)) report("stretch", `<${el.tag}> crosses a ${axis} cut line; keep it inside one zone`);
  }
}
