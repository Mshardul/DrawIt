import { expect, test } from "@playwright/test";

// The measurer wraps with the real bundled fonts. The expected lines are the same in every engine, so the
// same literals must hold in Chromium and WebKit.
interface Case {
  family: "Inter" | "Source Serif 4" | "JetBrains Mono";
  size: number;
  weight: 400 | 700;
  italic: boolean;
  width: number;
  text: string;
  lines: string[];
}

const fox = "The quick brown fox jumps over the lazy dog, e.g. twice.";
const cyrillic = "Привет мир, это длинная строка текста";
const greek = "Αυτό είναι ένα μεγάλο κείμενο στα ελληνικά";
const long = "Supercalifragilisticexpialidocious word";

const cases: Case[] = [
  { family: "Inter", size: 14, weight: 400, italic: false, width: 90, text: fox, lines: ["The quick", "brown fox", "jumps over", "the lazy dog,", "e.g. twice."] },
  { family: "Inter", size: 14, weight: 400, italic: false, width: 160, text: cyrillic, lines: ["Привет мир, это", "длинная строка текста"] },
  { family: "Inter", size: 14, weight: 400, italic: false, width: 160, text: greek, lines: ["Αυτό είναι ένα μεγάλο", "κείμενο στα ελληνικά"] },
  { family: "Inter", size: 14, weight: 400, italic: false, width: 90, text: long, lines: ["Supercalifrag", "ilisticexpialid", "ocious word"] },
  { family: "Inter", size: 14, weight: 400, italic: false, width: 90, text: "line one\n\nline three", lines: ["line one", "", "line three"] },
  { family: "Source Serif 4", size: 16, weight: 700, italic: true, width: 160, text: fox, lines: ["The quick brown fox", "jumps over the lazy", "dog, e.g. twice."] },
  { family: "Source Serif 4", size: 16, weight: 700, italic: true, width: 160, text: cyrillic, lines: ["Привет мир, это", "длинная строка", "текста"] },
  { family: "Source Serif 4", size: 16, weight: 700, italic: true, width: 160, text: long, lines: ["Supercalifragilistice", "xpialidocious word"] },
  { family: "JetBrains Mono", size: 13, weight: 400, italic: false, width: 160, text: fox, lines: ["The quick brown fox", "jumps over the lazy", "dog, e.g. twice."] },
  { family: "JetBrains Mono", size: 13, weight: 400, italic: false, width: 160, text: long, lines: ["Supercalifragilistic", "expialidocious word"] },
];

test("wrapped lines are the same in every engine and fit their width", async ({ page }) => {
  await page.goto("/");
  const results = await page.evaluate(async (input) => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { loadFonts } = await load<typeof import("../src/text/fonts.ts")>("/src/text/fonts.ts");
    const { createTextMeasurer, fontShorthand } = await load<typeof import("../src/text/measure.ts")>("/src/text/measure.ts");
    await loadFonts();
    const measurer = createTextMeasurer();
    const ctx = document.createElement("canvas").getContext("2d") as CanvasRenderingContext2D;
    return input.map((c) => {
      const style = { family: c.family, size: c.size, weight: c.weight, italic: c.italic };
      ctx.font = fontShorthand(style);
      const lines = measurer.wrap(c.text, c.width, style);
      return { lines, widest: Math.max(...lines.map((l) => ctx.measureText(l).width)) };
    });
  }, cases);
  for (const [i, c] of cases.entries()) {
    expect(results[i]?.lines, `${c.family} ${String(c.width)} ${c.text.slice(0, 12)}`).toEqual(c.lines);
  }
  // A long word is split between characters, so every line fits except a single character wider than the box.
  for (const [i, c] of cases.entries()) {
    expect(results[i]?.widest ?? Infinity, `${c.family} ${c.text.slice(0, 12)} fits`).toBeLessThanOrEqual(c.width);
  }
});

test("a second wrap of unchanged text does not reach the canvas", async ({ page }) => {
  await page.goto("/");
  const calls = await page.evaluate(async () => {
    const load = <T>(path: string) => import(path) as Promise<T>;
    const { loadFonts } = await load<typeof import("../src/text/fonts.ts")>("/src/text/fonts.ts");
    const { createTextMeasurer } = await load<typeof import("../src/text/measure.ts")>("/src/text/measure.ts");
    await loadFonts();
    let count = 0;
    const proto = CanvasRenderingContext2D.prototype;
    const original = Object.getOwnPropertyDescriptor(proto, "measureText") as PropertyDescriptor;
    const real = original.value as (this: CanvasRenderingContext2D, text: string) => TextMetrics;
    Object.defineProperty(proto, "measureText", {
      ...original,
      value(this: CanvasRenderingContext2D, text: string) {
        count += 1;
        return real.call(this, text);
      },
    });
    const measurer = createTextMeasurer();
    const style = { family: "Inter", size: 14, weight: 400, italic: false } as const;
    const text = "The quick brown fox jumps over the lazy dog";
    measurer.wrap(text, 120, style);
    const afterFirst = count;
    measurer.wrap(text, 120, style);
    Object.defineProperty(proto, "measureText", original);
    return { afterFirst, afterRepeat: count };
  });
  expect(calls.afterFirst).toBeGreaterThan(0);
  expect(calls.afterRepeat).toBe(calls.afterFirst);
});
