import { describe, expect, it } from "vitest";
import type { DiagramElement, Style } from "../model/index.ts";
import { BUILT_IN_THEME, defaultStyleFor } from "./defaults.ts";
import { createStyleResolver } from "./resolve.ts";

const bare: Style = { theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} }, classes: [], overrides: [] };
const resolve = createStyleResolver(bare, BUILT_IN_THEME, defaultStyleFor);

const node: DiagramElement = { kind: "node", id: "n", shape: "rect" };
const shape: DiagramElement = { kind: "shape", id: "s", shape: "rect" };
const text: DiagramElement = { kind: "text", id: "t", content: "x" };
const edge: DiagramElement = { kind: "edge", id: "e", from: "a", to: "b" };

describe("built-in theme", () => {
  it("defines the well-known tokens", () => {
    expect(BUILT_IN_THEME.colors).toEqual({
      primary: "#1f4e79",
      accent: "#e8732a",
      ink: "#1a1a1a",
      paper: "#ffffff",
      surface: "#dbe8f5",
      line: "#1f4e79",
    });
    expect(BUILT_IN_THEME.fonts).toEqual({ body: "Inter", heading: "Inter", mono: "JetBrains Mono" });
    expect(BUILT_IN_THEME.sizes).toEqual({ small: 12, body: 14, h3: 18, h2: 24, h1: 36, stroke: 1.5, leading: 24 });
    expect(BUILT_IN_THEME.spaces).toEqual({ sm: 4, md: 8, lg: 16 });
  });
});

describe("default look", () => {
  it("draws a node with a surface fill, a line stroke and centred ink text", () => {
    expect(resolve(node)).toEqual({
      fill: "#dbe8f5",
      stroke: "#1f4e79",
      strokeWidth: 1.5,
      dash: "solid",
      radius: 0,
      opacity: 1,
      font: "Inter",
      size: 14,
      weight: 400,
      italic: false,
      underline: false,
      color: "#1a1a1a",
      align: "center",
      lineHeight: 24,
    });
  });

  it("gives a shape a fill and stroke and no text properties", () => {
    expect(resolve(shape)).toEqual({
      fill: "#dbe8f5",
      stroke: "#1f4e79",
      strokeWidth: 1.5,
      dash: "solid",
      radius: 0,
      opacity: 1,
    });
  });

  it("gives a text box no fill or stroke and left-aligned ink text", () => {
    expect(resolve(text)).toEqual({
      radius: 0,
      opacity: 1,
      font: "Inter",
      size: 14,
      weight: 400,
      italic: false,
      underline: false,
      color: "#1a1a1a",
      align: "left",
      lineHeight: 24,
    });
  });

  it("gives an edge an ink stroke, a straight route and an arrow at the end", () => {
    expect(resolve(edge)).toEqual({
      stroke: "#1a1a1a",
      strokeWidth: 1.5,
      dash: "solid",
      opacity: 1,
      font: "Inter",
      size: 14,
      weight: 400,
      italic: false,
      underline: false,
      color: "#1a1a1a",
      align: "center",
      lineHeight: 24,
      route: "straight",
      headStart: "none",
      headEnd: "arrow",
    });
  });

  it("gives frames, images and unknown nodes no style", () => {
    expect(resolve({ kind: "frame", id: "f" })).toEqual({});
    expect(resolve({ kind: "image", id: "i", src: "assets/a.png" })).toEqual({});
  });

  it("follows a file's redefined token", () => {
    const themed: Style = { ...bare, theme: { ...bare.theme, colors: { surface: "#ffeecc" } } };
    expect(createStyleResolver(themed, BUILT_IN_THEME, defaultStyleFor)(node).fill).toBe("#ffeecc");
  });
});
