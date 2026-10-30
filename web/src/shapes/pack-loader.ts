// The pack loader: takes the files of every pack from a source, checks them with the validator and
// answers by shape name. A pack that fails is left out whole and its problems are reported, so one bad
// pack never hides the others. Stretched drawings are cached by shape and size.
import type { Point } from "../model/layout.ts";
import { flatten, parsePath } from "./path.ts";
import { parseSvg, type SvgEl } from "./svg.ts";
import { stretchPoint, stretchSvg, targetBox } from "./stretch.ts";
import type { PackManifest, Problem, ShapeManifest, Size } from "./types.ts";
import { validatePack } from "./validate.ts";

/** The files of one pack as a source hands them over. */
export interface PackFiles {
  /** Name of the pack's folder; it must equal the pack id. */
  folder: string;
  /** Text of `pack.json`. */
  manifest: string;
  /** SVG text by file name. */
  svgs: Record<string, string>;
}

/** A shape drawn at one element size. */
export interface ShapeDrawing {
  /** The shape's SVG with every coordinate stretched and the viewBox set to `box`. */
  svg: SvgEl;
  /** The size drawn: the element size, or for a keep-aspect shape the largest box of its ratio inside it. */
  box: Size;
  /** The outline flattened to a closed polygon in the element's own space, where the shape is drawn. */
  outline: Point[];
  /** The default attach points for `auto`, stretched like the outline, in the element's own space. */
  anchors: Record<"top" | "right" | "bottom" | "left", Point>;
  /** False when no part takes the fill, as for a shape drawn only with strokes: its inside is empty. */
  filled: boolean;
}

/** Finds the manifest of a shape by the name written in the file. */
export type ShapeLookup = (name: string) => ShapeManifest | undefined;

export interface PackLoader {
  /** Everything wrong with the source. Packs with a problem are not loaded. */
  problems: Problem[];
  /** The shape named `<pack>.<id>`, or `<id>` for a `core` shape. */
  shape(name: string): ShapeManifest | undefined;
  /** `name` drawn at `size`. The same object comes back for the same shape and size. */
  drawing(name: string, size: Size): ShapeDrawing | undefined;
  /** Every loaded shape with its full name, in pack and manifest order. */
  shapes(): { name: string; shape: ShapeManifest }[];
  /** The names in `names` that no pack provides, each once, in the order first seen. */
  unknownShapes(names: readonly string[]): string[];
}

/** Sizes kept per shape. A drag visits many sizes, and only the recent ones are drawn again. */
const SIZES_PER_SHAPE = 512;

interface Loaded {
  manifest: PackManifest;
  svgs: Record<string, string>;
}

/** Every pack that can be loaded, and the problems of those that cannot. */
function check(source: readonly PackFiles[]): { loaded: Loaded[]; problems: Problem[] } {
  const loaded: Loaded[] = [];
  const problems: Problem[] = [];
  const seen = new Set<string>();
  for (const files of source) {
    let manifest: unknown;
    try {
      manifest = JSON.parse(files.manifest);
    } catch (e) {
      problems.push({ pack: files.folder, code: "schema", message: `pack.json is not valid JSON: ${e instanceof Error ? e.message : String(e)}` });
      continue;
    }
    const found = validatePack(manifest, (file) => files.svgs[file]);
    const id = (manifest as Partial<PackManifest> | null)?.pack;
    if (typeof id === "string") {
      if (id !== files.folder) found.push({ pack: id, code: "schema", message: `folder ${files.folder} must be named after the pack id ${id}` });
      if (seen.has(id)) found.push({ pack: id, code: "schema", message: `pack ${id} appears twice` });
      seen.add(id);
    }
    problems.push(...found);
    if (found.length === 0) loaded.push({ manifest: manifest as PackManifest, svgs: files.svgs });
  }
  return { loaded, problems };
}

/** Every problem in `source`, including a folder named differently from its pack id and a pack id used twice. */
export function validatePackFiles(source: readonly PackFiles[]): Problem[] {
  return check(source).problems;
}

const hasFill = (el: SvgEl): boolean => el.attrs["data-role"] === "fill" || el.children.some(hasFill);

export function createPackLoader(source: readonly PackFiles[]): PackLoader {
  const { loaded, problems } = check(source);
  const shapes = new Map<string, { shape: ShapeManifest; svg: string }>();
  for (const { manifest, svgs } of loaded) {
    for (const shape of manifest.shapes) shapes.set(`${manifest.pack}.${shape.id}`, { shape, svg: svgs[shape.svg] ?? "" });
  }
  const fullName = (name: string): string => (name.includes(".") ? name : `core.${name}`);
  const find = (name: string) => shapes.get(fullName(name));

  const parsed = new Map<string, SvgEl>();
  const drawings = new Map<string, Map<string, ShapeDrawing>>();

  return {
    problems,
    shape: (name) => find(name)?.shape,
    shapes: () => [...shapes].map(([name, { shape }]) => ({ name, shape })),
    drawing(name, size) {
      const entry = find(name);
      if (!entry) return undefined;
      const full = fullName(name);
      const sizes = drawings.get(full) ?? new Map<string, ShapeDrawing>();
      drawings.set(full, sizes);
      const key = `${String(size.w)}x${String(size.h)}`;
      const cached = sizes.get(key);
      if (cached) {
        sizes.delete(key);
        sizes.set(key, cached);
        return cached;
      }
      const { shape } = entry;
      const root = parsed.get(full) ?? parseSvg(entry.svg);
      parsed.set(full, root);
      const box = targetBox(shape.size, size, shape.keepAspect);
      const x = (size.w - box.w) / 2;
      const y = (size.h - box.h) / 2;
      const outlineSvg = stretchSvg({ tag: "svg", attrs: {}, children: [{ tag: "path", attrs: { d: shape.outline }, children: [] }] }, shape.size, box, shape.stretch);
      const outline = flatten(parsePath(outlineSvg.children[0]?.attrs["d"] ?? "")).points.map((p) => ({ x: p.x + x, y: p.y + y }));
      const place = (p: Point): Point => {
        const q = stretchPoint(p, shape.size, box, shape.stretch);
        return { x: q.x + x, y: q.y + y };
      };
      const { top, right, bottom, left } = shape.anchors;
      const anchors = { top: place(top), right: place(right), bottom: place(bottom), left: place(left) };
      const drawing = { svg: stretchSvg(root, shape.size, box, shape.stretch), box, outline, anchors, filled: hasFill(root) };
      sizes.set(key, drawing);
      if (sizes.size > SIZES_PER_SHAPE) sizes.delete(sizes.keys().next().value as string);
      return drawing;
    },
    unknownShapes: (names) => [...new Set(names.filter((n) => find(n) === undefined))],
  };
}
