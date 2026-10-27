import { describe, expect, it } from "vitest";
import { parseSvg } from "./svg.ts";

describe("shape SVG parsing", () => {
  it("reads elements, attributes, self-closing tags and nesting", () => {
    const tree = parseSvg(`<?xml version="1.0"?>
      <!-- a comment -->
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8">
        <g><path data-role='fill' d="M 0 0 Z"/></g>
        <rect data-role="stroke" x="0" y="0" width="8" height="8"></rect>
      </svg>`);
    expect(tree.tag).toBe("svg");
    expect(tree.attrs["viewBox"]).toBe("0 0 8 8");
    expect(tree.children.map((c) => c.tag)).toEqual(["g", "rect"]);
    expect(tree.children[0]?.children[0]?.attrs).toEqual({ "data-role": "fill", d: "M 0 0 Z" });
  });

  it("refuses a doctype, entities, CDATA and text content", () => {
    expect(() => parseSvg('<!DOCTYPE svg><svg/>')).toThrow(/DOCTYPE/);
    expect(() => parseSvg('<!ENTITY a "b"><svg/>')).toThrow();
    expect(() => parseSvg("<svg><![CDATA[x]]></svg>")).toThrow(/CDATA/);
    expect(() => parseSvg("<svg>hello</svg>")).toThrow(/text/);
  });

  it("refuses unbalanced or mismatched tags and several roots", () => {
    expect(() => parseSvg("<svg><g></svg>")).toThrow();
    expect(() => parseSvg("<svg></g>")).toThrow();
    expect(() => parseSvg("<svg/><svg/>")).toThrow(/one root/);
    expect(() => parseSvg("")).toThrow();
  });
});
