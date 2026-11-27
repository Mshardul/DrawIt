import { describe, expect, it } from "vitest";
import { keyLabel } from "./key-label.ts";

describe("shortcut labels", () => {
  it("writes a plain letter in capitals", () => {
    expect(keyLabel({ key: "r", alt: false }, true)).toBe("R");
  });

  it("uses symbols on a Mac and words elsewhere", () => {
    expect(keyLabel({ key: "z", mod: true, shift: false }, true)).toBe("⌘ Z");
    expect(keyLabel({ key: "z", mod: true, shift: true }, true)).toBe("⇧ ⌘ Z");
    expect(keyLabel({ key: "z", mod: true, shift: true }, false)).toBe("Ctrl+Shift+Z");
    expect(keyLabel({ key: "2", code: "Digit2", shift: true }, true)).toBe("⇧ 2");
  });

  it("writes minus as a minus sign and takes the first of several chords", () => {
    expect(keyLabel({ key: "-", mod: true }, true)).toBe("⌘ −");
    expect(keyLabel([{ key: "=", mod: true }, { key: "+", mod: true }], false)).toBe("Ctrl+=");
  });
});
