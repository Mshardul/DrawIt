import { describe, expect, it } from "vitest";
import { editorActions, type Action, type ActionHost } from "./actions.ts";
import { filterShortcutList, shortcutList } from "./shortcut-list.ts";

function host(): ActionHost {
  const noop = (): void => {};
  return {
    save: noop, undo: noop, redo: noop, toggleGrid: noop, toggleSnap: noop,
    zoomIn: noop, zoomOut: noop, resetZoom: noop, zoomToFit: noop, zoomToSelection: noop,
    setTool: noop, canEdit: () => true, openPreferences: noop, toggleShown: noop,
  };
}

const sample: Action[] = [
  { id: "tool-select", title: "Select", group: "tools", key: { key: "v", alt: false }, enabled: () => true, run: () => {} },
  { id: "undo", title: "Undo", group: "editing", key: { key: "z", mod: true }, enabled: () => true, run: () => {} },
  { id: "zoom-in", title: "Zoom in", group: "view", key: { key: "=", mod: true }, enabled: () => true, run: () => {} },
  { id: "save", title: "Save", group: "files", key: { key: "s", mod: true }, enabled: () => true, run: () => {} },
  { id: "preferences", title: "Preferences…", group: "files", enabled: () => true, run: () => {} },
];

describe("shortcut list", () => {
  it("groups actions in Tools, Editing, View and Files order", () => {
    const groups = shortcutList(sample, true);
    expect(groups.map((g) => g.title)).toEqual(["Tools", "Editing", "View", "Files"]);
    expect(groups.map((g) => g.rows.map((r) => r.id))).toEqual([
      ["tool-select"],
      ["undo"],
      ["zoom-in"],
      ["save", "preferences"],
    ]);
  });

  it("leaves key unset when an action has no key", () => {
    const row = shortcutList(sample, true).flatMap((g) => g.rows).find((r) => r.id === "preferences");
    expect(row?.key).toBeUndefined();
  });

  it("filters by action title or key across groups and drops empty groups", () => {
    const groups = filterShortcutList(shortcutList(sample, true), "zoom");
    expect(groups.map((g) => g.title)).toEqual(["View"]);
    expect(groups[0]?.rows.map((r) => r.id)).toEqual(["zoom-in"]);
    const byKey = filterShortcutList(shortcutList(sample, true), "⌘ S");
    expect(byKey.map((g) => g.rows.map((r) => r.id))).toEqual([["save"]]);
  });

  it("does not match the Not set label as a key", () => {
    const ids = filterShortcutList(shortcutList(sample, true), "set").flatMap((g) => g.rows.map((r) => r.id));
    expect(ids).not.toContain("preferences");
  });

  it("adds a new table action into its group with no other change", () => {
    const actions: Action[] = [
      ...editorActions(host()),
      { id: "demo", title: "Demo action", group: "editing", enabled: () => true, run: () => {} },
    ];
    const editing = shortcutList(actions, true).find((g) => g.id === "editing");
    expect(editing?.rows.some((r) => r.id === "demo" && r.title === "Demo action")).toBe(true);
  });
});
