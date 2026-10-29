import { describe, expect, it } from "vitest";
import type { DiagramElement, Style, StyleProps, Theme } from "../model/index.ts";
import { createStyleResolver } from "./resolve.ts";

const emptyTheme: Theme = { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} };
const fallback: Theme = {
  name: "built-in",
  colors: { primary: "#111111", ink: "#222222" },
  fonts: { body: "Inter" },
  sizes: { body: 14, stroke: 1.5 },
  spaces: { md: 8 },
};

function style(partial: Partial<Style> = {}): Style {
  return { theme: emptyTheme, classes: [], overrides: [], ...partial };
}

const node: DiagramElement = { kind: "node", id: "a", shape: "rect" };

function resolver(s: Style, defaults: StyleProps = {}) {
  return createStyleResolver(s, fallback, () => defaults);
}

describe("style resolution", () => {
  it("returns the defaults for the element kind when nothing else sets a property", () => {
    const resolve = resolver(style(), { fill: "#abcdef", opacity: 1 });
    expect(resolve(node)).toEqual({ fill: "#abcdef", opacity: 1 });
  });

  it("asks for the defaults of the element's own kind", () => {
    const kinds: string[] = [];
    const resolve = createStyleResolver(style(), fallback, (kind) => {
      kinds.push(kind);
      return {};
    });
    resolve(node);
    resolve({ kind: "text", id: "t", content: "x" });
    expect(kinds).toEqual(["node", "text"]);
  });

  it("lets the class win over the defaults and the override win over the class", () => {
    const s = style({
      classes: [{ name: "c", props: { fill: "#222222", stroke: "#333333" } }],
      overrides: [{ id: "a", props: { stroke: "#444444" } }],
    });
    const resolve = resolver(s, { fill: "#111111", stroke: "#111111", opacity: 1 });
    expect(resolve({ ...node, class: "c" })).toEqual({ fill: "#222222", stroke: "#444444", opacity: 1 });
  });

  it("ignores a class the file does not define", () => {
    const resolve = resolver(style(), { opacity: 1 });
    expect(resolve({ ...node, class: "missing" })).toEqual({ opacity: 1 });
  });

  it("merges several override lines for one element in order", () => {
    const s = style({
      overrides: [
        { id: "a", props: { fill: "#111111", opacity: 0.5 } },
        { id: "a", props: { fill: "#222222" } },
      ],
    });
    expect(resolver(s)(node)).toEqual({ fill: "#222222", opacity: 0.5 });
  });

  it("replaces a token from the file's theme by the kind of property", () => {
    const s = style({
      theme: { ...emptyTheme, colors: { body: "#ff0000" }, fonts: { body: "Mono" }, sizes: { body: 20 } },
      overrides: [{ id: "a", props: { fill: "$body", font: "$body", size: "$body" } }],
    });
    expect(resolver(s)(node)).toEqual({ fill: "#ff0000", font: "Mono", size: 20 });
  });

  it("takes a well-known token the file lacks from the built-in theme", () => {
    const s = style({ overrides: [{ id: "a", props: { stroke: "$primary", font: "$body", strokeWidth: "$stroke" } }] });
    expect(resolver(s)(node)).toEqual({ stroke: "#111111", font: "Inter", strokeWidth: 1.5 });
  });

  it("prefers the file's token over the built-in one", () => {
    const s = style({
      theme: { ...emptyTheme, colors: { primary: "#999999" } },
      overrides: [{ id: "a", props: { stroke: "$primary" } }],
    });
    expect(resolver(s)(node)).toEqual({ stroke: "#999999" });
  });

  it("leaves a property unset when no theme defines its token", () => {
    const s = style({ overrides: [{ id: "a", props: { fill: "$nowhere", opacity: 0.5 } }] });
    const resolve = resolver(s, { fill: "#111111" });
    const resolved = resolve(node);
    expect(resolved).toEqual({ opacity: 0.5 });
    expect("fill" in resolved).toBe(false);
  });

  it("does not let a token from a default fall back to the property below it", () => {
    const s = style({ classes: [{ name: "c", props: { fill: "$nowhere" } }] });
    const resolve = resolver(s, { fill: "#111111" });
    expect(resolve({ ...node, class: "c" })).toEqual({});
  });

  it("replaces tokens in the defaults too", () => {
    expect(resolver(style(), { stroke: "$ink", size: "$body" })(node)).toEqual({ stroke: "#222222", size: 14 });
  });

  it("finds numeric tokens in sizes and then in spaces", () => {
    const s = style({ overrides: [{ id: "a", props: { radius: "$md" } }] });
    expect(resolver(s)(node)).toEqual({ radius: 8 });
  });

  it("keeps literal values and properties that take no token", () => {
    const s = style({ overrides: [{ id: "a", props: { dash: "dashed", italic: true, route: "elbow", headEnd: "dot" } }] });
    expect(resolver(s)(node)).toEqual({ dash: "dashed", italic: true, route: "elbow", headEnd: "dot" });
  });

  it("keeps extension properties, later layers winning", () => {
    const s = style({
      classes: [{ name: "c", props: { ext: { a: 1, b: 2 } } }],
      overrides: [{ id: "a", props: { ext: { b: 3 } } }],
    });
    expect(resolver(s)({ ...node, class: "c" })).toEqual({ ext: { a: 1, b: 3 } });
  });

  it("does not change the style it reads from", () => {
    const s = style({ overrides: [{ id: "a", props: { fill: "$primary" } }] });
    const before = JSON.stringify(s);
    resolver(s)(node);
    expect(JSON.stringify(s)).toBe(before);
  });
});
