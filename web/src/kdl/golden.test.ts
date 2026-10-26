import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readDiagram } from "./read.ts";
import { writeDiagram } from "./write.ts";

const goldenDir = new URL("./golden/", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, goldenDir), "utf8");
const names = (dir: string): string[] =>
  readdirSync(new URL(`${dir}/`, goldenDir))
    .filter((f) => f.endsWith(".drawit.kdl"))
    .sort();

const openThenSave = (text: string): string => writeDiagram(readDiagram(text).document);

describe("golden files", () => {
  const canonical = names("canonical");

  it("[T-005] has canonical golden files", () => {
    expect(canonical.length).toBeGreaterThanOrEqual(4);
  });

  for (const name of canonical) {
    it(`[T-005] open then save reproduces canonical/${name} byte for byte`, () => {
      const text = read(`canonical/${name}`);
      expect(openThenSave(text)).toBe(text);
    });
  }

  const messy = names("normalise").filter((f) => !f.endsWith(".expected.drawit.kdl"));

  it("[T-005] has non-canonical golden files", () => {
    expect(messy.length).toBeGreaterThanOrEqual(1);
  });

  for (const name of messy) {
    it(`[T-005] open then save normalises normalise/${name} to its canonical bytes`, () => {
      const expected = read(`normalise/${name.replace(".drawit.kdl", ".expected.drawit.kdl")}`);
      const out = openThenSave(read(`normalise/${name}`));
      expect(out).toBe(expected);
      expect(openThenSave(out)).toBe(out);
    });
  }
});
