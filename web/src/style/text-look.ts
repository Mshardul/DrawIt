// How text is drawn and measured: the resolved text properties of an element, with a value that
// cannot be drawn replaced by the default. One look serves measuring, wrapping, drawing and the editor.
import type { StyleProps } from "../model/index.ts";
import { FONT_FAMILIES, type FontFamily } from "../text/fonts.ts";
import type { TextStyle } from "../text/measure.ts";
import { BUILT_IN_THEME } from "./defaults.ts";
import { COLOUR } from "./values.ts";

export interface TextLook {
  style: TextStyle;
  color: string;
  underline: boolean;
  align: "left" | "center" | "right";
  /** Distance between baselines. */
  lineHeight: number;
}

const isFamily = (value: unknown): value is FontFamily => FONT_FAMILIES.some((f) => f === value);
const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;

export function textLookOf(props: StyleProps): TextLook {
  const { font, size, weight, italic, underline, color, align, lineHeight } = props;
  return {
    style: {
      family: isFamily(font) ? font : "Inter",
      size: positive(size) ? size : 14,
      // Only regular and bold are bundled.
      weight: positive(weight) && weight >= 600 ? 700 : 400,
      italic: italic === true,
    },
    color: typeof color === "string" && COLOUR.test(color) && !color.startsWith("$") ? color : (BUILT_IN_THEME.colors["ink"] ?? "#1a1a1a"),
    underline: underline === true,
    align: align === "center" || align === "right" ? align : "left",
    lineHeight: positive(lineHeight) ? lineHeight : 24,
  };
}

/** What an element has when nothing in the file sets a text property. */
export const DEFAULT_LOOK: TextLook = textLookOf({});
