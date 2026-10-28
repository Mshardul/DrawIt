// Where text goes: the size of a text box and the area a label is centred in. Pure functions over a
// measurer, so selection, resize and the renderer all get the same answer.
import { stretchPoint, targetBox } from "../shapes/stretch.ts";
import type { Rect, ShapeManifest, Size } from "../shapes/types.ts";
import type { TextMeasurer, TextStyle } from "../text/measure.ts";

/** The text style every element has until styling arrives. */
export const DEFAULT_TEXT_STYLE: TextStyle = { family: "Inter", size: 14, weight: 400, italic: false };

/** Distance between baselines. */
export const LINE_HEIGHT = 24;

/** Narrowest a text box that fits its content gets, so an empty one can still be selected. */
export const MIN_TEXT_W = 8;

export interface TextBoxLayout {
  w: number;
  h: number;
  lines: string[];
}

/**
 * A text box with no `w` is as wide as its longest line. With `w` it wraps there. Either way the
 * height is the number of lines, so a `h` in the layout file does not apply to text boxes.
 */
export function layoutTextBox(content: string, w: number | undefined, measurer: TextMeasurer, style: TextStyle = DEFAULT_TEXT_STYLE): TextBoxLayout {
  if (w !== undefined) {
    const lines = measurer.wrap(content, w, style);
    return { w, h: lines.length * LINE_HEIGHT, lines };
  }
  const lines = content.split("\n");
  const widest = Math.max(...lines.map((line) => measurer.width(line, style)));
  return { w: Math.max(MIN_TEXT_W, Math.ceil(widest)), h: lines.length * LINE_HEIGHT, lines };
}

/**
 * The rectangle a label is centred in, in the element's own space. A shape from a pack has its
 * manifest rectangle carried through the shape's stretch zones; a rectangle, an ellipse or any shape
 * without a manifest uses the whole box.
 */
export function labelArea(box: Size, manifest?: ShapeManifest): Rect {
  if (!manifest) return { x: 0, y: 0, w: box.w, h: box.h };
  const fit = targetBox(manifest.size, box, manifest.keepAspect);
  const offsetX = (box.w - fit.w) / 2;
  const offsetY = (box.h - fit.h) / 2;
  const { label } = manifest;
  const from = stretchPoint({ x: label.x, y: label.y }, manifest.size, fit, manifest.stretch);
  const to = stretchPoint({ x: label.x + label.w, y: label.y + label.h }, manifest.size, fit, manifest.stretch);
  return { x: offsetX + from.x, y: offsetY + from.y, w: to.x - from.x, h: to.y - from.y };
}

export interface LabelLayout {
  lines: string[];
  /** Horizontal centre of every line, in the element's own space. */
  x: number;
  /** Top of the block of lines. */
  top: number;
  area: Rect;
}

/** A label wrapped to its area, the block of lines centred on the area. */
export function labelLayout(label: string, box: Size, measurer: TextMeasurer, manifest?: ShapeManifest, style: TextStyle = DEFAULT_TEXT_STYLE): LabelLayout {
  const area = labelArea(box, manifest);
  const lines = measurer.wrap(label, area.w, style);
  return { lines, x: area.x + area.w / 2, top: area.y + (area.h - lines.length * LINE_HEIGHT) / 2, area };
}
