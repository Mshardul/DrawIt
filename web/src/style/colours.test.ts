import { describe, expect, it } from "vitest";
import type { DiagramDocument } from "../model/index.ts";
import { RecentColours, themeTokens } from "./colours.ts";

function docWith(colors: Record<string, string>): DiagramDocument {
  return {
    version: 1,
    plugins: [{ id: "core", version: 1 }],
    elements: [],
    style: { theme: { name: "default", colors, fonts: {}, sizes: {}, spaces: {} }, classes: [], overrides: [] },
    layout: [],
  };
}

describe("theme tokens offered by the picker", () => {
  it("lists the well-known colour tokens in the built-in order", () => {
    expect(themeTokens(docWith({})).map((t) => t.token)).toEqual([
      "$primary", "$accent", "$ink", "$paper", "$surface", "$line",
    ]);
  });

  it("pairs each token with its colour", () => {
    expect(themeTokens(docWith({})).find((t) => t.token === "$accent")).toEqual({ token: "$accent", colour: "#e8732a" });
  });

  it("takes a redefined token's colour from the file", () => {
    expect(themeTokens(docWith({ accent: "#00ff00" })).find((t) => t.token === "$accent")?.colour).toBe("#00ff00");
  });

  it("adds the file's own colour tokens after the well-known ones", () => {
    const tokens = themeTokens(docWith({ brand: "#123456", accent: "#00ff00" })).map((t) => t.token);
    expect(tokens.slice(-1)).toEqual(["$brand"]);
    expect(tokens).toHaveLength(7);
  });
});

describe("recent colours", () => {
  it("lists the newest first", () => {
    const recent = new RecentColours();
    recent.add("#111111");
    recent.add("#222222");
    expect(recent.list()).toEqual(["#222222", "#111111"]);
  });

  it("moves a colour used again to the front without repeating it", () => {
    const recent = new RecentColours();
    recent.add("#111111");
    recent.add("#222222");
    recent.add("#111111");
    expect(recent.list()).toEqual(["#111111", "#222222"]);
  });

  it("treats letter case alike", () => {
    const recent = new RecentColours();
    recent.add("#ABCDEF");
    recent.add("#abcdef");
    expect(recent.list()).toEqual(["#abcdef"]);
  });

  it("keeps the newest eight", () => {
    const recent = new RecentColours();
    for (let i = 0; i < 10; i++) recent.add(`#00000${String(i)}`);
    expect(recent.list()).toHaveLength(8);
    expect(recent.list()[0]).toBe("#000009");
  });

  it("keeps only raw colours, not tokens or gradients", () => {
    const recent = new RecentColours();
    recent.add("$accent");
    recent.add("linear(90, red, blue)");
    expect(recent.list()).toEqual([]);
  });

  it("starts empty for each session", () => {
    expect(new RecentColours().list()).toEqual([]);
  });
});
