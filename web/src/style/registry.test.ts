import { describe, expect, it } from "vitest";
import type { StyleProps } from "../model/index.ts";
import { PROPERTIES, propertiesIn, propertyByName } from "./registry.ts";

describe("property registry", () => {
  it("lists the properties of the spec by group", () => {
    const names = (group: Parameters<typeof propertiesIn>[0]) => propertiesIn(group).map((p) => p.name);
    expect(names("fill")).toEqual(["fill", "opacity"]);
    expect(names("stroke")).toEqual(["stroke", "stroke-width", "dash", "radius"]);
    expect(names("effects")).toEqual(["shadow"]);
    expect(names("text")).toEqual(["font", "size", "weight", "italic", "underline", "color", "align", "line-height"]);
    expect(names("edge")).toEqual(["route", "head-start", "head-end"]);
  });

  it("covers every style property of the model once", () => {
    const keys: (keyof StyleProps)[] = PROPERTIES.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual(
      [
        "fill", "opacity", "stroke", "strokeWidth", "dash", "radius", "shadow", "font", "size", "weight",
        "italic", "underline", "color", "align", "lineHeight", "route", "headStart", "headEnd",
      ].sort(),
    );
  });

  it("finds a property by its file name", () => {
    expect(propertyByName("stroke-width")?.key).toBe("strokeWidth");
    expect(propertyByName("strokeWidth")).toBeUndefined();
    expect(propertyByName("nope")).toBeUndefined();
  });

  it("gives each property a value type", () => {
    const type = (name: string) => propertyByName(name)?.type;
    expect(type("fill")).toBe("fill");
    expect(type("stroke")).toBe("colour");
    expect(type("color")).toBe("colour");
    expect(type("font")).toBe("font");
    expect(type("shadow")).toBe("shadow");
    expect(type("italic")).toBe("boolean");
    expect(type("size")).toBe("number");
    expect(type("dash")).toBe("choice");
  });

  it("lists the accepted values of a choice", () => {
    expect(propertyByName("dash")?.choices).toEqual(["solid", "dashed", "dotted"]);
    expect(propertyByName("align")?.choices).toEqual(["left", "center", "right"]);
    expect(propertyByName("route")?.choices).toEqual(["straight", "elbow"]);
    expect(propertyByName("head-end")?.choices).toEqual(["arrow", "dot", "none"]);
    expect(propertyByName("fill")?.choices).toBeUndefined();
  });

  it("bounds the numbers", () => {
    expect(propertyByName("opacity")).toMatchObject({ min: 0, max: 1 });
    expect(propertyByName("stroke-width")).toMatchObject({ min: 0 });
    expect(propertyByName("weight")).toMatchObject({ min: 100, max: 900 });
  });

  it("accepts values by type", () => {
    const ok = (name: string, value: unknown) => propertyByName(name)?.accepts(value);
    expect(ok("opacity", 0.5)).toBe(true);
    expect(ok("opacity", 2)).toBe(false);
    expect(ok("opacity", "$half")).toBe(true);
    expect(ok("dash", "dotted")).toBe(true);
    expect(ok("dash", "wavy")).toBe(false);
    expect(ok("italic", true)).toBe(true);
    expect(ok("italic", "yes")).toBe(false);
    expect(ok("fill", "linear(90, $a, $b)")).toBe(true);
    expect(ok("fill", "linear(90, $a)")).toBe(false);
    expect(ok("stroke", "#ff0000")).toBe(true);
    expect(ok("stroke", "linear(90, $a, $b)")).toBe(false);
    expect(ok("shadow", "2 2 4 $ink")).toBe(true);
    expect(ok("shadow", "big")).toBe(false);
    expect(ok("font", "Inter")).toBe(true);
  });
});
