// The built-in theme and the default look of each element kind.
import type { DiagramElement, StyleProps, Theme } from "../model/index.ts";

/** Supplies every well-known token a file's theme does not define. */
export const BUILT_IN_THEME: Theme = {
  name: "default",
  colors: {
    primary: "#1f4e79",
    accent: "#e8732a",
    ink: "#1a1a1a",
    paper: "#ffffff",
    surface: "#dbe8f5",
    line: "#1f4e79",
  },
  fonts: { body: "Inter", heading: "Inter", mono: "JetBrains Mono" },
  sizes: { small: 12, body: 14, h3: 18, h2: 24, h1: 36, stroke: 1.5, leading: 24 },
  spaces: { sm: 4, md: 8, lg: 16 },
};

const text = {
  font: "$body",
  size: "$body",
  weight: 400,
  italic: false,
  underline: false,
  color: "$ink",
  lineHeight: "$leading",
} as const satisfies StyleProps;

const outlined = {
  fill: "$surface",
  stroke: "$line",
  strokeWidth: "$stroke",
  dash: "solid",
  radius: 0,
  opacity: 1,
} as const satisfies StyleProps;

const NODE: StyleProps = { ...outlined, ...text, align: "center" };
const SHAPE: StyleProps = outlined;
const TEXT_BOX: StyleProps = { radius: 0, opacity: 1, ...text, align: "left" };
const EDGE: StyleProps = {
  stroke: "$ink",
  strokeWidth: "$stroke",
  dash: "solid",
  opacity: 1,
  ...text,
  align: "center",
  route: "straight",
  headStart: "none",
  headEnd: "arrow",
};
const NONE: StyleProps = {};

/** What an element of this kind looks like when nothing in the file sets a property. */
export function defaultStyleFor(kind: DiagramElement["kind"]): StyleProps {
  switch (kind) {
    case "node":
      return NODE;
    case "shape":
      return SHAPE;
    case "text":
      return TEXT_BOX;
    case "edge":
      return EDGE;
    default:
      return NONE;
  }
}
