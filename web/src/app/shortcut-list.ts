import type { Action, ActionGroup } from "./actions.ts";
import { keyLabel } from "./key-label.ts";

export interface ShortcutRow {
  id: string;
  title: string;
  key?: string;
}

export interface ShortcutGroup {
  id: ActionGroup;
  title: string;
  rows: ShortcutRow[];
}

const ORDER: readonly { id: ActionGroup; title: string }[] = [
  { id: "tools", title: "Tools" },
  { id: "editing", title: "Editing" },
  { id: "view", title: "View" },
  { id: "files", title: "Files" },
];

export const NOT_SET = "Not set";

export function shortcutList(actions: readonly Action[], mac: boolean): ShortcutGroup[] {
  return ORDER.flatMap(({ id, title }) => {
    const rows = actions
      .filter((action) => action.group === id)
      .map((action): ShortcutRow => ({
        id: action.id,
        title: action.title,
        key: action.key === undefined ? undefined : keyLabel(action.key, mac),
      }));
    return rows.length === 0 ? [] : [{ id, title, rows }];
  });
}

export function filterShortcutList(groups: readonly ShortcutGroup[], query: string): ShortcutGroup[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [...groups];
  return groups.flatMap((group) => {
    const rows = group.rows.filter(
      (row) => row.title.toLowerCase().includes(needle)
        || (row.key !== undefined && row.key.toLowerCase().includes(needle)),
    );
    return rows.length === 0 ? [] : [{ ...group, rows }];
  });
}
