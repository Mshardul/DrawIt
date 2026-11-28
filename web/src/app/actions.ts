import { LAYOUT_PARTS, PART_NAMES, type LayoutPart } from "./layout.ts";
import type { Tool } from "./tool.ts";

export interface ActionKey {
  key: string;
  code?: string;
  mod?: boolean;
  /** When omitted, Shift does not affect the match. */
  shift?: boolean;
  alt?: boolean;
}

export type ActionGroup = "tools" | "editing" | "view" | "files";

export interface Action {
  id: string;
  title: string;
  group: ActionGroup;
  key?: ActionKey | readonly ActionKey[];
  /** Save still runs while a text field is focused. */
  duringTyping?: boolean;
  enabled: () => boolean;
  run: () => void;
}

export interface KeyPress {
  key: string;
  code?: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  preventDefault?: () => void;
}

export interface ActionHost {
  save(): void;
  undo(): void;
  redo(): void;
  toggleGrid(): void;
  toggleSnap(): void;
  zoomIn(): void;
  zoomOut(): void;
  resetZoom(): void;
  zoomToFit(): void;
  zoomToSelection(): void;
  setTool(tool: Tool): void;
  canEdit(): boolean;
  openPreferences(): void;
  toggleShown(part: LayoutPart): void;
}

function chordsOf(action: Action): readonly ActionKey[] {
  const key = action.key;
  if (key === undefined) return [];
  return "key" in key ? [key] : key;
}

function keyMatches(chord: ActionKey, event: KeyPress): boolean {
  const mod = Boolean(event.metaKey || event.ctrlKey);
  if (Boolean(chord.mod) !== mod) return false;
  if (chord.shift !== undefined && chord.shift !== Boolean(event.shiftKey)) return false;
  if (chord.alt !== undefined && chord.alt !== Boolean(event.altKey)) return false;
  if (chord.code !== undefined && event.code === chord.code) return true;
  return event.key.toLowerCase() === chord.key.toLowerCase();
}

export function dispatchKey(actions: readonly Action[], event: KeyPress, typing = false): boolean {
  for (const action of actions) {
    if (!chordsOf(action).some((chord) => keyMatches(chord, event))) continue;
    if ((typing && !action.duringTyping) || !action.enabled()) return false;
    event.preventDefault?.();
    action.run();
    return true;
  }
  return false;
}

const always = (): boolean => true;

export function editorActions(host: ActionHost): Action[] {
  const tool = (id: string, title: string, key: string, value: Tool): Action => ({
    id, title, group: "tools", key: { key, alt: false }, enabled: always, run: () => { host.setTool(value); },
  });
  return [
    { id: "save", title: "Save", group: "files", key: { key: "s", mod: true }, duringTyping: true, enabled: always, run: () => { host.save(); } },
    { id: "undo", title: "Undo", group: "editing", key: { key: "z", mod: true, shift: false, alt: false }, enabled: () => host.canEdit(), run: () => { host.undo(); } },
    { id: "redo", title: "Redo", group: "editing", key: { key: "z", mod: true, shift: true, alt: false }, enabled: () => host.canEdit(), run: () => { host.redo(); } },
    { id: "grid", title: "Grid", group: "view", key: { key: "g", shift: false, alt: false }, enabled: always, run: () => { host.toggleGrid(); } },
    { id: "snap", title: "Snap", group: "view", key: { key: "g", shift: true, alt: false }, enabled: always, run: () => { host.toggleSnap(); } },
    {
      id: "zoom-in",
      title: "Zoom in",
      group: "view",
      key: [{ key: "=", mod: true, alt: false }, { key: "+", mod: true, alt: false }],
      enabled: always,
      run: () => { host.zoomIn(); },
    },
    { id: "zoom-out", title: "Zoom out", group: "view", key: { key: "-", mod: true, alt: false }, enabled: always, run: () => { host.zoomOut(); } },
    { id: "zoom-reset", title: "Reset zoom", group: "view", key: { key: "0", mod: true, alt: false }, enabled: always, run: () => { host.resetZoom(); } },
    { id: "zoom-fit", title: "Zoom to fit", group: "view", key: { key: "1", code: "Digit1", shift: true, alt: false }, enabled: always, run: () => { host.zoomToFit(); } },
    { id: "zoom-selection", title: "Zoom to selection", group: "view", key: { key: "2", code: "Digit2", shift: true, alt: false }, enabled: always, run: () => { host.zoomToSelection(); } },
    tool("tool-select", "Select", "v", "select"),
    tool("tool-hand", "Hand", "h", "hand"),
    tool("tool-line", "Line", "l", "line"),
    tool("tool-arrow", "Arrow", "a", "arrow"),
    tool("tool-frame", "Frame", "f", "frame"),
    tool("tool-rect", "Rectangle", "r", "rect"),
    tool("tool-ellipse", "Ellipse", "o", "ellipse"),
    tool("tool-text", "Text", "t", "text"),
    tool("tool-image", "Image", "i", "image"),
    { id: "preferences", title: "Preferences…", group: "files", enabled: always, run: () => { host.openPreferences(); } },
    ...LAYOUT_PARTS.map((part): Action => ({
      id: `toggle-${part}`,
      title: `Toggle ${PART_NAMES[part].toLowerCase()}`,
      group: "view",
      enabled: always,
      run: () => { host.toggleShown(part); },
    })),
  ];
}
