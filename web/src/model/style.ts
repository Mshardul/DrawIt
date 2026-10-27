// Style section: all appearance.
import type { KdlValue, UnknownNode } from "./structure.ts";

/** Reference to a theme token, written `$name`. */
export type TokenRef = `$${string}`;

/** A literal or a theme token reference. */
export type Styled<T> = T | TokenRef;

export type Route = "straight" | "elbow";
export type ArrowHead = "arrow" | "dot" | "none";

/** Properties of the style groups. All optional. */
export interface StyleProps {
  // Fill
  /** Colour or gradient. */
  fill?: Styled<string>;
  opacity?: Styled<number>;
  // Stroke
  stroke?: Styled<string>;
  strokeWidth?: Styled<number>;
  dash?: string;
  radius?: Styled<number>;
  // Effects
  shadow?: string;
  // Text
  font?: Styled<string>;
  size?: Styled<number>;
  weight?: Styled<number>;
  italic?: boolean;
  underline?: boolean;
  color?: Styled<string>;
  align?: "left" | "center" | "right";
  lineHeight?: Styled<number>;
  // Edge
  route?: Route;
  headStart?: ArrowHead;
  headEnd?: ArrowHead;
  /** Typed properties registered by packs and plugins. */
  ext?: Record<string, KdlValue>;
}

/** Named tokens. v1 has one theme. */
export interface Theme {
  name: string;
  colors: Record<string, string>;
  fonts: Record<string, string>;
  sizes: Record<string, number>;
  spaces: Record<string, number>;
}

export interface StyleClass {
  name: string;
  props: StyleProps;
}

/** Per-element override: `el <id> <props>`. */
export interface ElementStyle {
  id: string;
  props: StyleProps;
}

export interface Style {
  theme: Theme;
  /** In listed order; later classes win. */
  classes: StyleClass[];
  overrides: ElementStyle[];
  /** Style statements from packs that are not installed, kept as written. */
  unknown?: UnknownNode[];
}
