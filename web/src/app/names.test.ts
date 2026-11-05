import { describe, expect, it } from "vitest";
import { diagramNameCheck, projectNameCheck } from "./names.ts";

describe("project names", () => {
  it("refuses an empty name without a message", () => {
    expect(projectNameCheck("", ["Demo"])).toEqual({ ok: false, message: "" });
  });

  it("refuses a name that matches an existing project in any case", () => {
    expect(projectNameCheck("home Network", ["Home network", "Notes"])).toEqual({
      ok: false,
      message: 'A project named "Home network" already exists.',
    });
  });

  it("refuses characters a folder name cannot use", () => {
    expect(projectNameCheck("bad/name", []).message).toBe("Use letters, numbers, spaces, hyphens and underscores.");
    expect(projectNameCheck("CON", []).ok).toBe(false);
    expect(projectNameCheck("Home network", ["Notes"])).toEqual({ ok: true, message: "" });
  });
});

describe("diagram names", () => {
  it("adds the extension and refuses a file that is already in the folder", () => {
    expect(diagramNameCheck("network", ["network.drawit.kdl", "notes.txt"], "Home network")).toEqual({
      ok: false,
      message: "network.drawit.kdl already exists in Home network.",
    });
    expect(diagramNameCheck("Network", ["network.drawit.kdl"], "Home network").message).toBe(
      "network.drawit.kdl already exists in Home network.",
    );
  });

  it("accepts a new name and refuses an empty one", () => {
    expect(diagramNameCheck("", ["a.drawit.kdl"], "Demo")).toEqual({ ok: false, message: "" });
    expect(diagramNameCheck("Plan", ["a.drawit.kdl"], "Demo")).toEqual({ ok: true, message: "" });
    expect(diagramNameCheck("a.b", [], "Demo").ok).toBe(false);
  });
});
