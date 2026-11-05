import { describe, expect, it } from "vitest";
import type { TopEntry } from "../storage/adapter.ts";
import { homeModel } from "./home.ts";

const now = new Date(2026, 10, 5, 15);

function at(day: number, hour = 9): string {
  return new Date(2026, 10, day, hour).toISOString();
}

function project(path: string, diagrams: number, modified: string, latest?: { path: string; modified: string }): TopEntry {
  return latest ? { type: "folder", path, diagrams, modified, latest } : { type: "folder", path, diagrams, modified };
}

describe("home", () => {
  it("offers the ways in when the library has no projects", () => {
    expect(homeModel([], {}, "/DrawIt", now)).toEqual({ kind: "first-run" });
    expect(homeModel([{ type: "file", path: "loose.drawit.kdl", size: 1, modified: at(5) }], {}, "/DrawIt", now)).toEqual({ kind: "first-run" });
  });

  it("makes one card per project from its latest diagram", () => {
    const model = homeModel(
      [
        project("Demo", 2, at(5), { path: "Demo/b.drawit.kdl", modified: at(5, 11) }),
        project("Empty", 0, at(4)),
      ],
      {},
      "/DrawIt",
      now,
    );
    expect(model).toEqual({
      kind: "projects",
      projects: [
        { name: "Demo", diagrams: "2 diagrams", latest: "b", preview: "Demo/b.drawit.kdl", when: "Today" },
        { name: "Empty", diagrams: "0 diagrams", when: "Yesterday" },
      ],
      recent: [],
    });
  });

  it("keeps a single diagram singular and names an older weekday", () => {
    const model = homeModel([project("Notes", 1, at(2), { path: "Notes/a.drawit.kdl", modified: at(2) })], {}, "/DrawIt", now);
    expect(model).toMatchObject({ projects: [{ diagrams: "1 diagram", latest: "a", when: "Mon" }] });
  });

  it("lists the library's recent diagrams and drops paths that are not one project file", () => {
    const model = homeModel([project("Demo", 1, at(5), { path: "Demo/a.drawit.kdl", modified: at(5) })], {
      recent: {
        "/DrawIt": ["Demo/network.drawit.kdl", "nope", "Drafts/Untitled 2.drawit.kdl", "Demo/assets/x.drawit.kdl"],
        "/other": ["Other/skip.drawit.kdl"],
      },
    }, "/DrawIt", now);
    expect(model).toMatchObject({
      recent: [
        { path: "Demo/network.drawit.kdl", name: "network", project: "Demo" },
        { path: "Drafts/Untitled 2.drawit.kdl", name: "Untitled 2", project: "Drafts" },
      ],
    });
  });
});
