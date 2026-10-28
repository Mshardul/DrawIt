// Command layer: the only way a document changes.
// Commands are plain, ID-addressed data; applying one returns the new document plus Immer
// forward and inverse patches. Nothing here knows about the UI.
import { applyPatches as immerApplyPatches, current, enablePatches, produceWithPatches } from "immer";
import type { Draft, Patch } from "immer";
import { isValidId } from "../model/index.ts";
import type { DiagramDocument, DiagramElement, LayoutEntry, StyleProps } from "../model/index.ts";

enablePatches();

export type { Patch };

/** Fields `setElement` can change. */
export interface ElementFields {
  label?: string;
  name?: string;
  content?: string;
  src?: string;
  shape?: string;
  class?: string;
  from?: string | null;
  to?: string | null;
}

export type LayoutFields = Partial<Omit<LayoutEntry, "id">>;

export interface AddCommand {
  type: "add";
  /** Appended in order, so they draw on top. */
  items: { element: DiagramElement; layout?: LayoutEntry }[];
}

/** Removes elements. Edges attached to them keep their ends as free ends where the elements were. */
export interface DeleteCommand {
  type: "delete";
  ids: string[];
}

export interface SetElementCommand {
  type: "setElement";
  id: string;
  set?: ElementFields;
  unset?: (keyof ElementFields)[];
}

/** One entry per element, so moving a selection is one command. Creates the entry when the element has none. */
export interface SetLayoutCommand {
  type: "setLayout";
  changes: { id: string; set?: LayoutFields; unset?: (keyof LayoutFields)[] }[];
}

export interface SetStyleCommand {
  type: "setStyle";
  target: { kind: "class"; name: string } | { kind: "el"; id: string };
  set?: StyleProps;
  unset?: (keyof StyleProps)[];
}

/** Moves layout entries to the front or back of the z-order, keeping their relative order. */
export interface ReorderCommand {
  type: "reorder";
  ids: string[];
  to: "front" | "back";
}

/** Renames an ID in structure, style and layout. */
export interface RenameCommand {
  type: "rename";
  id: string;
  newId: string;
}

/** Commands applied as one step: a drag, a multi-selection move or a paste. All or none. */
export interface BatchCommand {
  type: "batch";
  commands: Command[];
}

export type Command =
  | AddCommand
  | DeleteCommand
  | SetElementCommand
  | SetLayoutCommand
  | SetStyleCommand
  | ReorderCommand
  | RenameCommand
  | BatchCommand;

export interface Applied {
  document: DiagramDocument;
  patches: Patch[];
  inverse: Patch[];
}

/** The command cannot be applied to this document. The document is left unchanged. */
export class CommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommandError";
  }
}

type Doc = Draft<DiagramDocument>;

function unset(target: object, keys: readonly string[] | undefined): void {
  for (const key of keys ?? []) Reflect.deleteProperty(target, key);
}

function element(doc: Doc, id: string): Doc["elements"][number] {
  const found = doc.elements.find((e) => e.id === id);
  if (!found) throw new CommandError(`No element "${id}"`);
  return found;
}

function checkNewId(doc: Doc, item: DiagramElement): void {
  const { id } = item;
  if (doc.elements.some((e) => e.id === id)) throw new CommandError(`ID "${id}" is already in use`);
  const derived = item.kind === "edge" && item.from !== null && item.to !== null && id === `${item.from}->${item.to}`;
  if (!isValidId(id) && !derived) throw new CommandError(`"${id}" is not a valid ID`);
}

function add(doc: Doc, command: AddCommand): void {
  for (const { element: item, layout } of command.items) {
    checkNewId(doc, item);
    doc.elements.push(item);
    if (layout) doc.layout.push({ ...layout, id: item.id });
  }
}

function remove(doc: Doc, command: DeleteCommand): void {
  const gone = new Set(command.ids);
  for (const id of gone) element(doc, id);
  // Where a removed element was, so attached edge ends can stay there.
  const centres = new Map<string, { x: number; y: number }>();
  for (const entry of doc.layout) {
    if (gone.has(entry.id)) centres.set(entry.id, { x: entry.x + (entry.w ?? 0) / 2, y: entry.y + (entry.h ?? 0) / 2 });
  }
  for (const item of doc.elements) {
    if (item.kind !== "edge" || gone.has(item.id)) continue;
    const entry = doc.layout.find((e) => e.id === item.id);
    for (const end of ["from", "to"] as const) {
      const target = item[end];
      const at = target === null ? undefined : centres.get(target);
      if (!at) continue;
      item[end] = null;
      const next = entry ?? doc.layout[doc.layout.push({ id: item.id, x: 0, y: 0 }) - 1];
      if (!next) continue;
      unset(next, [end]);
      next[end === "from" ? "fromPoint" : "toPoint"] = at;
    }
  }
  doc.elements = doc.elements.filter((e) => !gone.has(e.id));
  doc.layout = doc.layout.filter((e) => !gone.has(e.id));
  doc.style.overrides = doc.style.overrides.filter((o) => !gone.has(o.id));
}

function setElement(doc: Doc, command: SetElementCommand): void {
  const target = element(doc, command.id);
  if (target.kind === "unknown") throw new CommandError(`"${command.id}" is an unknown element and cannot be edited`);
  Object.assign(target, command.set);
  unset(target, command.unset);
}

function setLayout(doc: Doc, command: SetLayoutCommand): void {
  // Index once: scanning the draft arrays for each change costs changes x elements proxy reads,
  // and a drag applies this command on every pointer move.
  const known = new Set(current(doc.elements).map((e) => e.id));
  const at = new Map<string, number>();
  current(doc.layout).forEach((e, i) => {
    if (!at.has(e.id)) at.set(e.id, i);
  });
  for (const { id, set, unset: keys } of command.changes) {
    if (!known.has(id)) throw new CommandError(`No element "${id}"`);
    let index = at.get(id);
    if (index === undefined) {
      index = doc.layout.push({ id, x: 0, y: 0 }) - 1;
      at.set(id, index);
    }
    const entry = doc.layout[index];
    if (!entry) continue;
    Object.assign(entry, set);
    unset(entry, keys);
  }
}

function setStyle(doc: Doc, command: SetStyleCommand): void {
  const { target } = command;
  let holder: { props: Draft<StyleProps> } | undefined;
  if (target.kind === "class") {
    holder = doc.style.classes.find((c) => c.name === target.name);
    if (!holder) holder = doc.style.classes[doc.style.classes.push({ name: target.name, props: {} }) - 1];
  } else {
    element(doc, target.id);
    holder = doc.style.overrides.find((o) => o.id === target.id);
    if (!holder) holder = doc.style.overrides[doc.style.overrides.push({ id: target.id, props: {} }) - 1];
  }
  if (!holder) return;
  Object.assign(holder.props, command.set);
  unset(holder.props, command.unset);
}

function reorder(doc: Doc, command: ReorderCommand): void {
  const moving = new Set(command.ids);
  for (const id of moving) element(doc, id);
  const moved = doc.layout.filter((e) => moving.has(e.id));
  const rest = doc.layout.filter((e) => !moving.has(e.id));
  doc.layout = command.to === "front" ? [...rest, ...moved] : [...moved, ...rest];
}

function rename(doc: Doc, command: RenameCommand): void {
  const { id, newId } = command;
  element(doc, id);
  if (!isValidId(newId)) throw new CommandError(`"${newId}" is not a valid ID`);
  if (doc.elements.some((e) => e.id === newId)) throw new CommandError(`ID "${newId}" is already in use`);
  const swap = (v: string): string => (v === id ? newId : v);
  for (const item of doc.elements) {
    if (item.kind === "edge") {
      const derived = item.from !== null && item.to !== null && item.id === `${item.from}->${item.to}`;
      if (item.from === id) item.from = newId;
      if (item.to === id) item.to = newId;
      if (derived) {
        const previous = item.id;
        item.id = `${item.from ?? "-"}->${item.to ?? "-"}`;
        const entry = doc.layout.find((e) => e.id === previous);
        if (entry) entry.id = item.id;
        const style = doc.style.overrides.find((o) => o.id === previous);
        if (style) style.id = item.id;
      }
    }
    item.id = swap(item.id);
  }
  for (const entry of doc.layout) entry.id = swap(entry.id);
  for (const override of doc.style.overrides) override.id = swap(override.id);
}

function mutate(doc: Doc, command: Command): void {
  switch (command.type) {
    case "add":
      add(doc, command);
      break;
    case "delete":
      remove(doc, command);
      break;
    case "setElement":
      setElement(doc, command);
      break;
    case "setLayout":
      setLayout(doc, command);
      break;
    case "setStyle":
      setStyle(doc, command);
      break;
    case "reorder":
      reorder(doc, command);
      break;
    case "rename":
      rename(doc, command);
      break;
    case "batch":
      for (const inner of command.commands) mutate(doc, inner);
      break;
    default:
      throw new CommandError(`Unknown command "${String((command as { type: unknown }).type)}"`);
  }
}

/** Applies a command. Throws `CommandError`, leaving the document as it was, if it does not fit the document. */
export function applyCommand(document: DiagramDocument, command: Command): Applied {
  const [next, patches, inverse] = produceWithPatches(document, (draft) => {
    mutate(draft, command);
  });
  return { document: next, patches, inverse };
}

/** Applies patches from `applyCommand`, forward or inverse, to a document. */
export function applyPatches(document: DiagramDocument, patches: Patch[]): DiagramDocument {
  return immerApplyPatches(document, patches);
}
