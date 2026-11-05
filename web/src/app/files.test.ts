import { describe, expect, it } from "vitest";
import { browseCrumbs, folderNameCheck, importCheck } from "./files.ts";

const bad = 'node a shape=rect\nnode "unterminated';

describe("import check", () => {
  it("accepts a diagram and refuses a file that does not parse, with its line and column", () => {
    expect(importCheck("pitch.drawit.kdl", "diagram version=1\n")).toEqual({ ok: true });
    expect(importCheck("notes.txt", "diagram version=1\n")).toEqual({ ok: false, message: "Choose a .drawit.kdl file." });
    const refused = importCheck("pitch.drawit.kdl", bad);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.message).toMatch(/^Can't import: line 2, column 19: /);
  });
});

describe("folder browser", () => {
  it("builds a breadcrumb from the home directory", () => {
    expect(browseCrumbs("/", "/")).toEqual([{ label: "Home", path: "/" }]);
    expect(browseCrumbs("/", "/Documents/docs")).toEqual([
      { label: "Home", path: "/" },
      { label: "Documents", path: "/Documents" },
      { label: "docs", path: "/Documents/docs" },
    ]);
    expect(browseCrumbs("/Users/me", "/Users/me/Documents")).toEqual([
      { label: "Home", path: "/Users/me" },
      { label: "Documents", path: "/Users/me/Documents" },
    ]);
  });

  it("refuses a folder name that is taken or not allowed", () => {
    expect(folderNameCheck("docs", ["Docs"])).toEqual({ ok: false, message: 'A folder named "Docs" already exists.' });
    expect(folderNameCheck("a/b", [])).toEqual({ ok: false, message: "Use letters, numbers, spaces, hyphens and underscores." });
    expect(folderNameCheck("sketches", ["docs"])).toEqual({ ok: true, message: "" });
  });
});
