import { describe, expect, it } from "vitest";
import { KdlSyntaxError, readDiagram } from "../kdl/read.ts";
import { MemoryVolume } from "../storage/memory.ts";
import { moveToProject } from "./move.ts";

const diagram = `diagram version=1

image one src="assets/logo.png"
image two src="assets/logo.png"
image remote src="https://example.com/a.png"
image gone src="assets/missing.png"
`;

function open() {
  const volume = new MemoryVolume({
    library: "/DrawIt",
    path: "/DrawIt",
    places: {
      "/DrawIt": {
        files: {
          "Drafts/Untitled.drawit.kdl": diagram,
          "Drafts/assets/logo.png": Uint8Array.of(1, 2, 3),
          "Drafts/Bad.drawit.kdl": "diagram {\n",
          "Demo/a.drawit.kdl": "a",
          "Demo/assets/logo.png": Uint8Array.of(9),
        },
      },
      "/DrawIt/Drafts": {
        files: {
          "Untitled.drawit.kdl": diagram,
          "assets/logo.png": Uint8Array.of(1, 2, 3),
          "Bad.drawit.kdl": "diagram {\n",
        },
      },
      "/DrawIt/Demo": { files: { "a.drawit.kdl": "a", "assets/logo.png": Uint8Array.of(9) } },
    },
  });
  return volume.tab();
}

describe("move to a project", () => {
  it("copies the images the diagram uses, rewrites their src, and removes the source file", async () => {
    const storage = open();
    await storage.claimSession();

    expect(await moveToProject(storage, "Drafts/Untitled.drawit.kdl", "Demo")).toBe("Demo/Untitled.drawit.kdl");

    const moved = readDiagram(new TextDecoder().decode(await storage.readLibrary("Demo/Untitled.drawit.kdl"))).document;
    const images = moved.elements.filter((element) => element.kind === "image");
    expect(images.map((element) => ("src" in element ? element.src : ""))).toEqual([
      "assets/logo 2.png",
      "assets/logo 2.png",
      "https://example.com/a.png",
      "assets/missing.png",
    ]);
    expect(await storage.readLibrary("Demo/assets/logo.png")).toEqual(Uint8Array.of(9));
    expect(await storage.readLibrary("Demo/assets/logo 2.png")).toEqual(Uint8Array.of(1, 2, 3));
    await expect(storage.readLibrary("Demo/assets/logo 3.png")).rejects.toMatchObject({ code: "not-found" });
    await expect(storage.readLibrary("Demo/assets/missing.png")).rejects.toMatchObject({ code: "not-found" });
    await expect(storage.readLibrary("Drafts/Untitled.drawit.kdl")).rejects.toMatchObject({ code: "not-found" });
    expect(await storage.readLibrary("Drafts/assets/logo.png")).toEqual(Uint8Array.of(1, 2, 3));
  });

  it("rewrites the recent lists so the diagram follows the move", async () => {
    const storage = open();
    await storage.claimSession();
    await storage.patchPreferences({
      recent: {
        "/DrawIt": ["Notes/b.drawit.kdl", "Drafts/Untitled.drawit.kdl"],
        "/DrawIt/Drafts": ["Untitled.drawit.kdl"],
        "/DrawIt/Demo": ["a.drawit.kdl"],
      },
    });
    await moveToProject(storage, "Drafts/Untitled.drawit.kdl", "Demo");
    expect(await storage.readPreferences()).toMatchObject({
      recent: {
        "/DrawIt": ["Notes/b.drawit.kdl", "Demo/Untitled.drawit.kdl"],
        "/DrawIt/Drafts": [],
        "/DrawIt/Demo": ["Untitled.drawit.kdl", "a.drawit.kdl"],
      },
    });
  });

  it("leaves the library unchanged when the diagram does not parse", async () => {
    const storage = open();
    await storage.claimSession();
    await expect(moveToProject(storage, "Drafts/Bad.drawit.kdl", "Demo")).rejects.toBeInstanceOf(KdlSyntaxError);
    expect(new TextDecoder().decode(await storage.readLibrary("Drafts/Bad.drawit.kdl"))).toBe("diagram {\n");
    await expect(storage.readLibrary("Demo/Bad.drawit.kdl")).rejects.toMatchObject({ code: "not-found" });
    expect(await storage.readLibrary("Demo/assets/logo.png")).toEqual(Uint8Array.of(9));
  });
});
