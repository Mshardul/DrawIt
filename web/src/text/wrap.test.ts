import { describe, expect, it } from "vitest";
import { breakLines } from "./wrap.ts";

// Every character is 10 wide, so a width of 50 holds five characters.
const mono = (s: string): number => Array.from(s).length * 10;

describe("text wrapping: breakLines", () => {
  it("text that fits stays on one line", () => {
    expect(breakLines("hello", 50, mono)).toEqual(["hello"]);
  });

  it("wraps at word boundaries", () => {
    expect(breakLines("aa bb cc dd", 50, mono)).toEqual(["aa bb", "cc dd"]);
  });

  it("trailing spaces do not count towards the width", () => {
    expect(breakLines("abcde fghij", 50, mono)).toEqual(["abcde", "fghij"]);
  });

  it("explicit line breaks always start a new line and keep blank lines", () => {
    expect(breakLines("ab\n\ncd", 50, mono)).toEqual(["ab", "", "cd"]);
  });

  it("a word wider than the box is split between characters", () => {
    expect(breakLines("abcdefghijkl", 50, mono)).toEqual(["abcde", "fghij", "kl"]);
  });

  it("never splits inside a character made of several code points", () => {
    const family = "👨‍👩‍👧";
    expect(breakLines(`${family}${family}${family}`, 20, mono).every((line) => line.length % family.length === 0)).toBe(true);
  });

  it("a character wider than the box still gets its own line", () => {
    expect(breakLines("ab", 5, mono)).toEqual(["a", "b"]);
  });

  it("breaks only at spaces, never inside punctuation such as e.g.", () => {
    expect(breakLines("tools -- e.g. KDL", 90, mono)).toEqual(["tools --", "e.g. KDL"]);
    // Word segmentation puts the final dot of "e.g." in a segment of its own, and engines disagree on such runs.
    expect(breakLines("aaa e.g.", 70, mono)).toEqual(["aaa", "e.g."]);
  });

  it("empty text is one empty line", () => {
    expect(breakLines("", 50, mono)).toEqual([""]);
  });
});
