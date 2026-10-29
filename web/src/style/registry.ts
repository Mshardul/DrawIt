// The style properties DrawIt knows, with the group each belongs to and the values it accepts.
// The style panel builds its fields from this list and the validator checks values against it.
import type { StyleProps } from "../model/index.ts";
import { COLOUR, parseGradient, parseShadow } from "./values.ts";

export type PropertyGroup = "fill" | "stroke" | "effects" | "text" | "edge";
export type PropertyType = "colour" | "fill" | "number" | "font" | "boolean" | "choice" | "shadow";

export interface PropertyDef {
  key: Exclude<keyof StyleProps, "ext">;
  /** As written in the file. */
  name: string;
  group: PropertyGroup;
  type: PropertyType;
  /** The accepted values of a choice. */
  choices?: readonly string[];
  /** Bounds of a number. */
  min?: number;
  max?: number;
  /** True when the value is valid for this property. A `$token` is valid wherever tokens apply. */
  accepts: (value: unknown) => boolean;
}

const isToken = (value: unknown): value is string => typeof value === "string" && /^\$[a-z][a-z0-9_-]*$/.test(value);

type Spec = Omit<PropertyDef, "accepts" | "type"> & { type: PropertyType };

function build(spec: Spec): PropertyDef {
  const { type, choices, min, max } = spec;
  let accepts: (value: unknown) => boolean;
  switch (type) {
    case "colour":
      accepts = (v) => isToken(v) || (typeof v === "string" && COLOUR.test(v));
      break;
    case "fill":
      accepts = (v) => isToken(v) || (typeof v === "string" && (COLOUR.test(v) || parseGradient(v) !== undefined));
      break;
    case "number":
      accepts = (v) =>
        isToken(v) ||
        (typeof v === "number" && Number.isFinite(v) && (min === undefined || v >= min) && (max === undefined || v <= max));
      break;
    case "font":
      accepts = (v) => typeof v === "string" && v !== "";
      break;
    case "boolean":
      accepts = (v) => typeof v === "boolean";
      break;
    case "choice":
      accepts = (v) => typeof v === "string" && (choices?.includes(v) ?? false);
      break;
    case "shadow":
      accepts = (v) => typeof v === "string" && parseShadow(v) !== undefined;
      break;
  }
  return { ...spec, accepts };
}

const DASH = ["solid", "dashed", "dotted"] as const;
const ALIGN = ["left", "center", "right"] as const;
const ROUTE = ["straight", "elbow"] as const;
const HEAD = ["arrow", "dot", "none"] as const;

/** In display order. */
export const PROPERTIES: readonly PropertyDef[] = [
  build({ key: "fill", name: "fill", group: "fill", type: "fill" }),
  build({ key: "opacity", name: "opacity", group: "fill", type: "number", min: 0, max: 1 }),
  build({ key: "stroke", name: "stroke", group: "stroke", type: "colour" }),
  build({ key: "strokeWidth", name: "stroke-width", group: "stroke", type: "number", min: 0 }),
  build({ key: "dash", name: "dash", group: "stroke", type: "choice", choices: DASH }),
  build({ key: "radius", name: "radius", group: "stroke", type: "number", min: 0 }),
  build({ key: "shadow", name: "shadow", group: "effects", type: "shadow" }),
  build({ key: "font", name: "font", group: "text", type: "font" }),
  build({ key: "size", name: "size", group: "text", type: "number", min: 1 }),
  build({ key: "weight", name: "weight", group: "text", type: "number", min: 100, max: 900 }),
  build({ key: "italic", name: "italic", group: "text", type: "boolean" }),
  build({ key: "underline", name: "underline", group: "text", type: "boolean" }),
  build({ key: "color", name: "color", group: "text", type: "colour" }),
  build({ key: "align", name: "align", group: "text", type: "choice", choices: ALIGN }),
  build({ key: "lineHeight", name: "line-height", group: "text", type: "number", min: 1 }),
  build({ key: "route", name: "route", group: "edge", type: "choice", choices: ROUTE }),
  build({ key: "headStart", name: "head-start", group: "edge", type: "choice", choices: HEAD }),
  build({ key: "headEnd", name: "head-end", group: "edge", type: "choice", choices: HEAD }),
];

const BY_NAME = new Map(PROPERTIES.map((p) => [p.name, p]));

export function propertyByName(name: string): PropertyDef | undefined {
  return BY_NAME.get(name);
}

export function propertiesIn(group: PropertyGroup): PropertyDef[] {
  return PROPERTIES.filter((p) => p.group === group);
}
