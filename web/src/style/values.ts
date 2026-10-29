// Parsing and printing of the structured style values. A value that does not parse gives
// undefined, so the caller can keep it as written and skip it when drawing.

export type Dash = "solid" | "dashed" | "dotted";

export interface GradientStop {
  /** A colour or a colour token. */
  color: string;
  /** From 0 to 1; a stop without one is spaced evenly between its neighbours. */
  at?: number;
}

export interface Gradient {
  /** Whole degrees. */
  angle: number;
  stops: GradientStop[];
}

export interface Shadow {
  dx: number;
  dy: number;
  blur: number;
  /** A colour or a colour token. */
  color: string;
}

export const COLOUR = /^(?:#[0-9a-fA-F]{3,8}|\$[a-z][a-z0-9_-]*|[a-zA-Z]+)$/;
const NUMBER = /^-?(?:\d+\.?\d*|\.\d+)$/;

export function parseDash(value: string): Dash | undefined {
  return value === "solid" || value === "dashed" || value === "dotted" ? value : undefined;
}

function number(text: string): number | undefined {
  return NUMBER.test(text) ? Number(text) : undefined;
}

function parseStop(text: string): GradientStop | undefined {
  const parts = text.trim().split(/\s+/);
  const [color, position, extra] = parts;
  if (color === undefined || !COLOUR.test(color) || extra !== undefined) return undefined;
  if (position === undefined) return { color };
  const at = number(position);
  return at !== undefined && at >= 0 && at <= 1 ? { color, at } : undefined;
}

/** `linear(<angle>, <stop>, <stop>…)`. */
export function parseGradient(value: string): Gradient | undefined {
  const match = /^linear\((.*)\)$/s.exec(value.trim());
  if (!match) return undefined;
  const [first, ...rest] = (match[1] ?? "").split(",");
  const angle = number((first ?? "").trim());
  if (angle === undefined || !Number.isInteger(angle) || rest.length < 2) return undefined;
  const stops: GradientStop[] = [];
  for (const text of rest) {
    const stop = parseStop(text);
    if (!stop) return undefined;
    stops.push(stop);
  }
  return { angle, stops };
}

export function printGradient(gradient: Gradient): string {
  const stops = gradient.stops.map((s) => (s.at === undefined ? s.color : `${s.color} ${String(s.at)}`));
  return `linear(${[String(gradient.angle), ...stops].join(", ")})`;
}

/** `<dx> <dy> <blur> <colour>`. */
export function parseShadow(value: string): Shadow | undefined {
  const parts = value.trim().split(/\s+/);
  if (parts.length !== 4) return undefined;
  const [dx, dy, blur] = [number(parts[0] ?? ""), number(parts[1] ?? ""), number(parts[2] ?? "")];
  const color = parts[3] ?? "";
  if (dx === undefined || dy === undefined || blur === undefined || blur < 0 || !COLOUR.test(color)) return undefined;
  return { dx, dy, blur, color };
}

export function printShadow(shadow: Shadow): string {
  return [shadow.dx, shadow.dy, shadow.blur].map(String).join(" ") + ` ${shadow.color}`;
}
