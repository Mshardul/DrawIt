import { describe, expect, test } from "vitest";
import { FONT_FACES, FONT_FAMILIES } from "./fonts.ts";

describe("font manifest", () => {
  test("bundles Inter, Source Serif 4 and JetBrains Mono", () => {
    expect([...FONT_FAMILIES]).toEqual(["Inter", "Source Serif 4", "JetBrains Mono"]);
  });

  test("every family has regular, bold, italic and bold italic in Latin, Greek and Cyrillic", () => {
    for (const family of FONT_FAMILIES) {
      const keys = FONT_FACES.filter((f) => f.family === family).map((f) => `${f.script} ${String(f.weight)} ${f.italic ? "italic" : "normal"}`);
      const expected = ["latin", "greek", "cyrillic"].flatMap((script) =>
        [400, 700].flatMap((weight) => [false, true].map((italic) => `${script} ${String(weight)} ${italic ? "italic" : "normal"}`)),
      );
      expect(keys.toSorted()).toEqual(expected.toSorted());
    }
  });

  test("every face is a distinct woff2 file with a unicode range", () => {
    const urls = FONT_FACES.map((f) => f.url);
    for (const url of urls) expect(url).toMatch(/\.woff2(\?.*)?$/);
    expect(new Set(urls).size).toBe(urls.length);
    for (const face of FONT_FACES) expect(face.unicodeRange).toMatch(/^U\+/);
  });
});
