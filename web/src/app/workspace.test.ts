import { describe, expect, it } from "vitest";
import { StorageError, readText } from "../storage/adapter.ts";
import { MemoryStorage } from "../storage/memory.ts";
import { openFile, workspaceFiles } from "./workspace.ts";

const canonical = `diagram version=1

node a "A" shape=rect
node b "B" shape=ellipse

layout {
  a x=0 y=0 w=100 h=50
  b x=200 y=0
}
`;

describe("open, save and invalid files", () => {
  it("[T-016] lists only the diagram files of the opened folder", async () => {
    const storage = new MemoryStorage({
      "b.drawit.kdl": canonical,
      "sub/a.drawit.kdl": canonical,
      "notes.txt": "x",
      "assets/logo.svg": "<svg/>",
    });
    expect(await workspaceFiles(storage)).toEqual(["b.drawit.kdl", "sub/a.drawit.kdl"]);
  });

  it("[T-016] opens a file into a document that is not dirty", async () => {
    const storage = new MemoryStorage({ "d.drawit.kdl": canonical });
    const result = await openFile(storage, "d.drawit.kdl");
    if (!result.ok) throw new Error("expected the file to open");
    expect(result.file.path).toBe("d.drawit.kdl");
    expect(result.file.document.elements.map((e) => e.id)).toEqual(["a", "b"]);
    expect(result.file.dirty).toBe(false);
  });

  it("[T-016] places elements that have no layout line on open, and a save writes the positions", async () => {
    const storage = new MemoryStorage({ "d.drawit.kdl": "diagram version=1\n\nnode a shape=rect\nnode b shape=rect\n" });
    const result = await openFile(storage, "d.drawit.kdl");
    if (!result.ok) throw new Error("expected the file to open");
    expect(result.file.document.layout).toEqual([
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 240, y: 0 },
    ]);
    expect(result.file.dirty).toBe(false);
    await result.file.save(storage);
    expect(await readText(storage, "d.drawit.kdl")).toContain("layout {\n  a x=0 y=0\n  b x=240 y=0\n}\n");
  });

  it("[T-016] is dirty after a command and clean again once the change is undone", async () => {
    const storage = new MemoryStorage({ "d.drawit.kdl": canonical });
    const result = await openFile(storage, "d.drawit.kdl");
    if (!result.ok) throw new Error("expected the file to open");
    const { file } = result;
    file.history.execute({ type: "setLayout", changes: [{ id: "a", set: { x: 40 } }] });
    expect(file.dirty).toBe(true);
    file.history.undo();
    expect(file.dirty).toBe(false);
  });

  it("[T-016] saves the document in canonical form and is clean afterwards", async () => {
    const storage = new MemoryStorage({ "d.drawit.kdl": canonical });
    const result = await openFile(storage, "d.drawit.kdl");
    if (!result.ok) throw new Error("expected the file to open");
    const { file } = result;
    file.history.execute({ type: "setLayout", changes: [{ id: "a", set: { x: 40 } }] });
    await file.save(storage);
    expect(await readText(storage, "d.drawit.kdl")).toBe(canonical.replace("a x=0", "a x=40"));
    expect(file.dirty).toBe(false);
  });

  it("[T-016] stays dirty when the save fails", async () => {
    const storage = new MemoryStorage({ "d.drawit.kdl": canonical });
    const result = await openFile(storage, "d.drawit.kdl");
    if (!result.ok) throw new Error("expected the file to open");
    const { file } = result;
    file.history.execute({ type: "setLayout", changes: [{ id: "a", set: { x: 40 } }] });
    storage.write = () => Promise.reject(new StorageError("refused", "no"));
    await expect(file.save(storage)).rejects.toMatchObject({ code: "refused" });
    expect(file.dirty).toBe(true);
  });

  it("[T-016] refuses a file that is not valid KDL, with line and column, and leaves it untouched", async () => {
    const bad = "diagram version=1\n\nnode a \"unclosed\n";
    const storage = new MemoryStorage({ "bad.drawit.kdl": bad });
    const result = await openFile(storage, "bad.drawit.kdl");
    if (result.ok) throw new Error("expected the file to be refused");
    expect(result.path).toBe("bad.drawit.kdl");
    expect(result.error.line).toBeGreaterThanOrEqual(1);
    expect(result.error.column).toBeGreaterThanOrEqual(1);
    expect(result.error.message).toMatch(/line \d+, column \d+/);
    expect(await readText(storage, "bad.drawit.kdl")).toBe(bad);
  });

  it("[T-016] reports a missing file as a storage error, not as an invalid file", async () => {
    await expect(openFile(new MemoryStorage(), "none.drawit.kdl")).rejects.toMatchObject({ code: "not-found" });
  });
});
