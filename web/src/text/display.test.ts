import { describe, expect, it } from "vitest";
import { breakLines } from "./wrap.ts";
import { applyDisplayEdit, displayIndex, editView, modelIndex, softBreaks } from "./display.ts";

// Every character is 10 wide, so a width of 50 holds five characters.
const mono = (s: string): number => Array.from(s).length * 10;
const view = (text: string, width = 50) => editView(text, breakLines(text, width, mono));

describe("soft breaks", () => {
  it("are where the wrap starts a new line inside a paragraph, after the spaces it dropped", () => {
    expect(softBreaks("aa bb cc dd", breakLines("aa bb cc dd", 50, mono))).toEqual([6]);
  });

  it("are not placed at explicit line breaks", () => {
    expect(softBreaks("ab\ncd", ["ab", "cd"])).toEqual([]);
    expect(softBreaks("ab\n\ncd", ["ab", "", "cd"])).toEqual([]);
  });

  it("are placed inside a word that was split between characters", () => {
    expect(softBreaks("abcdefghij", breakLines("abcdefghij", 50, mono))).toEqual([5]);
  });

  it("come after a whole run of spaces", () => {
    expect(softBreaks("aaaa    bbbb", breakLines("aaaa    bbbb", 50, mono))).toEqual([8]);
  });

  it("leave leading spaces of a paragraph where they are", () => {
    expect(softBreaks("  hi there", breakLines("  hi there", 50, mono))).toEqual([5]);
  });

  it("add a break for every wrapped line of every paragraph", () => {
    const text = "aa bb cc dd\nee ff gg hh";
    expect(softBreaks(text, breakLines(text, 50, mono))).toEqual([6, 18]);
  });
});

describe("display text", () => {
  it("is the text with a newline at each soft break, trailing spaces kept", () => {
    expect(view("aa bb cc dd").display).toBe("aa bb \ncc dd");
  });

  it("splits into the same lines the wrap gave, apart from trailing spaces", () => {
    const samples = ["aa bb cc dd", "abcdefghijkl mn", "  hi there  you", "one\n\ntwo three four", "aaaa    bbbb", "x", "", "a b c d e f g h i j k l"];
    for (const text of samples) {
      for (const width of [30, 50, 80, 400]) {
        const lines = breakLines(text, width, mono);
        expect(editView(text, lines).display.split("\n").map((l) => l.trimEnd()), `${JSON.stringify(text)} at ${String(width)}`).toEqual(lines);
      }
    }
  });

  it("never changes the characters apart from the newlines it adds", () => {
    const v = view("aa bb cc dd ee ff");
    expect(v.display.replaceAll("\n", "")).toBe(v.text.replaceAll("\n", ""));
  });
});

describe("index mapping", () => {
  const v = view("aa bb cc dd");

  it("maps a model index to the display, after the newline when it sits on a break", () => {
    expect(displayIndex(v.breaks, 5)).toBe(5);
    expect(displayIndex(v.breaks, 6)).toBe(7);
    expect(displayIndex(v.breaks, 8)).toBe(9);
  });

  it("maps a display index back, both sides of the newline giving the break", () => {
    expect(modelIndex(v.breaks, 6)).toBe(6);
    expect(modelIndex(v.breaks, 7)).toBe(6);
    expect(modelIndex(v.breaks, 9)).toBe(8);
  });

  it("round trips every model index", () => {
    for (let t = 0; t <= v.text.length; t++) expect(modelIndex(v.breaks, displayIndex(v.breaks, t))).toBe(t);
  });
});

describe("applying an edit made in the display", () => {
  const edit = (text: string, next: string, caret: number, inputType = "insertText", width = 50) =>
    applyDisplayEdit(view(text, width), next, { start: caret, end: caret }, inputType);

  it("typing a character adds it to the text", () => {
    const result = edit("aa bb", "aa bbc", 6);
    expect(result.text).toBe("aa bbc");
    expect(result.selection).toEqual({ start: 6, end: 6 });
  });

  it("typing inside a wrapped line lands at the matching place in the text", () => {
    // display "aa bb \ncc dd": a character typed after "cc" is at display index 9.
    const result = edit("aa bb cc dd", "aa bb \nccX dd", 10);
    expect(result.text).toBe("aa bb ccX dd");
    expect(result.selection).toEqual({ start: 9, end: 9 });
  });

  it("deleting a character before a soft break moves the caret in the text correctly", () => {
    const result = edit("aa bb cc dd", "aa b \ncc dd", 4, "deleteContentBackward");
    expect(result.text).toBe("aa b cc dd");
    expect(result.selection).toEqual({ start: 4, end: 4 });
  });

  it("an explicit newline typed in the display is kept as a line break", () => {
    const result = edit("aabb", "aa\nbb", 3);
    expect(result.text).toBe("aa\nbb");
  });

  it("backspace at the start of a wrapped line deletes the character before the break", () => {
    // Caret at display 7 (start of "cc"); the browser removes the newline at display 6.
    const result = edit("aa bb cc dd", "aa bb cc dd", 6, "deleteContentBackward");
    expect(result.text).toBe("aa bbcc dd");
    expect(result.selection).toEqual({ start: 5, end: 5 });
  });

  it("delete at the end of a wrapped line deletes the character after the break", () => {
    const result = edit("aa bb cc dd", "aa bb cc dd", 6, "deleteContentForward");
    expect(result.text).toBe("aa bb c dd");
    expect(result.selection).toEqual({ start: 6, end: 6 });
  });

  it("backspace at the very start does nothing", () => {
    const result = applyDisplayEdit(view("abc"), "abc", { start: 0, end: 0 }, "deleteContentBackward");
    expect(result.text).toBe("abc");
  });

  it("replacing a selection that spans a soft break replaces the text between", () => {
    // Select display 3..9 ("bb \ncc") and type X.
    const result = edit("aa bb cc dd", "aa X dd", 4);
    expect(result.text).toBe("aa X dd");
    expect(result.selection).toEqual({ start: 4, end: 4 });
  });

  it("pasted Windows line breaks become plain ones", () => {
    const result = edit("ab", "a\r\nb" + "b", 4);
    expect(result.text).toBe("a\nbb");
  });

  it("maps a selection range, not just a caret", () => {
    const result = applyDisplayEdit(view("aa bb cc dd"), "aa bb \ncc ddX", { start: 7, end: 13 }, "insertText");
    expect(result.text).toBe("aa bb cc ddX");
    expect(result.selection).toEqual({ start: 6, end: 12 });
  });

  it("an edit that changes nothing returns the same text", () => {
    const v = view("aa bb cc dd");
    expect(applyDisplayEdit(v, v.display, { start: 3, end: 3 }, "insertText").text).toBe("aa bb cc dd");
  });
});
