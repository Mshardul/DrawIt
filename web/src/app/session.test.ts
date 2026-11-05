import { describe, expect, it } from "vitest";
import { ImageStore } from "../images/store.ts";
import { MemoryStorage, MemoryVolume } from "../storage/memory.ts";
import { enterWorkspace, firstScreen, type EditorSession } from "./session.ts";

function session(storage: MemoryStorage): EditorSession {
  return {
    storage,
    images: new ImageStore({
      storage,
      onChange: () => {},
      decode: () => Promise.reject(new Error("unused")),
      createUrl: () => "blob:unused",
      revokeUrl: () => {},
    }),
    file: null,
    info: { id: "", kind: "", path: "" },
  };
}

describe("first screen", () => {
  it("opens a project or an opened folder on its landing page", () => {
    expect(firstScreen("project")).toBe("landing");
    expect(firstScreen("opened")).toBe("landing");
  });

  it("opens the library and a start with no folder on Home", () => {
    expect(firstScreen("library")).toBe("home");
    expect(firstScreen("")).toBe("home");
  });
});

describe("opening a workspace", () => {
  it("writes the opened folder into preferences", async () => {
    const volume = new MemoryVolume({
      path: "/lib",
      library: "/lib",
      folders: ["Demo"],
      places: { "/lib/Demo": { files: { "a.drawit.kdl": "diagram version=1\n" } } },
    });
    const storage = new MemoryStorage({}, { volume });
    await storage.claimSession();
    const open = session(storage);
    open.info = await storage.currentWorkspace();
    await enterWorkspace(open, { project: "Demo" });
    expect(open.info).toMatchObject({ kind: "project", path: "/lib/Demo" });
    expect(await storage.readPreferences()).toMatchObject({ workspace: { folder: "/lib/Demo" } });
  });

  it("does not write a preference when the place cannot be opened", async () => {
    const storage = new MemoryStorage();
    await expect(enterWorkspace(session(storage), { library: true })).rejects.toThrow();
    expect(await storage.readPreferences()).toEqual({ version: 1 });
  });
});
