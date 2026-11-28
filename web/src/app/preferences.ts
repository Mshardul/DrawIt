import { openDialog } from "./dialog.ts";
import type { Action } from "./actions.ts";
import type { SavingPrefs } from "./autosave.ts";
import { LAYOUT_PARTS, PART_NAMES, type Layout } from "./layout.ts";
import type { PreferenceStore } from "./preference-store.ts";
import type { StartupPrefs } from "./session.ts";
import {
  filterShortcutList,
  NOT_SET,
  shortcutList,
  type ShortcutGroup,
  type ShortcutRow,
} from "./shortcut-list.ts";
import {
  GRID_SIZE_MAX,
  GRID_SIZE_MIN,
  parseGridSize,
  type CanvasPrefs,
} from "./status.ts";

const UNSAVED = "Preferences can't be saved. Changes last until DrawIt closes.";

const TABS = ["General", "Shortcuts"] as const;

type Tab = (typeof TABS)[number];

let opened = 0;

function build(
  layout: Layout,
  canvas: CanvasPrefs,
  saving: SavingPrefs,
  startup: StartupPrefs,
  actions: readonly Action[],
  mac: boolean,
): { element: HTMLElement; panels: HTMLElement } {
  opened += 1;
  const prefix = `prefs-${String(opened)}`;
  const list = document.createElement("div");
  list.className = "tabs";
  list.setAttribute("role", "tablist");
  const body = document.createElement("div");
  body.className = "tab-panels";
  const tabs = new Map<Tab, HTMLButtonElement>();
  const panels = new Map<Tab, HTMLElement>();

  const select = (name: Tab, focus: boolean): void => {
    for (const tab of TABS) {
      const on = tab === name;
      const button = tabs.get(tab);
      const panel = panels.get(tab);
      if (!button || !panel) continue;
      button.setAttribute("aria-selected", String(on));
      button.tabIndex = on ? 0 : -1;
      panel.hidden = !on;
      if (on && focus) button.focus();
    }
  };

  for (const name of TABS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tab";
    button.id = `${prefix}-tab-${name}`;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", `${prefix}-panel-${name}`);
    button.textContent = name;
    button.addEventListener("click", () => { select(name, false); });
    button.addEventListener("keydown", (event) => {
      const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (step === 0) return;
      event.preventDefault();
      const next = TABS[(TABS.indexOf(name) + step + TABS.length) % TABS.length];
      if (next) select(next, true);
    });
    tabs.set(name, button);
    const panel = document.createElement("div");
    panel.className = "tab-panel";
    panel.id = `${prefix}-panel-${name}`;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", button.id);
    if (name === "General") {
      panel.append(
        interfaceSection(layout),
        canvasSection(canvas, prefix),
        savingSection(saving),
        startupSection(startup, prefix),
      );
    } else {
      panel.append(shortcutsSection(actions, mac));
    }
    panels.set(name, panel);
    list.append(button);
    body.append(panel);
  }
  select("General", false);

  const wrap = document.createElement("div");
  wrap.className = "prefs";
  wrap.append(list, body);
  return { element: wrap, panels: body };
}

function interfaceSection(layout: Layout): HTMLElement {
  const section = document.createElement("section");
  const heading = document.createElement("h3");
  heading.textContent = "Interface";
  section.append(heading);
  for (const part of LAYOUT_PARTS) {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = layout.shown(part);
    box.addEventListener("change", () => { layout.setShown(part, box.checked); });
    const label = document.createElement("label");
    label.className = "pref-row";
    label.append(box, PART_NAMES[part]);
    section.append(label);
  }
  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "btn";
  reset.textContent = "Reset layout";
  reset.addEventListener("click", () => { layout.reset(); });
  const note = document.createElement("span");
  note.className = "note";
  note.textContent = "Panel widths and toolbar position";
  const row = document.createElement("div");
  row.className = "pref-row";
  row.append(reset, note);
  section.append(row);
  return section;
}

function checkRow(label: string, checked: boolean, onChange: (on: boolean) => void): HTMLElement {
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = checked;
  box.addEventListener("change", () => { onChange(box.checked); });
  const row = document.createElement("label");
  row.className = "pref-row";
  row.append(box, label);
  return row;
}

function radioRows<T extends string>(
  group: string,
  current: T,
  choices: ReadonlyArray<readonly [T, string]>,
  onChange: (value: T) => void,
): HTMLElement[] {
  return choices.map(([value, text]) => {
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = group;
    radio.value = value;
    radio.checked = current === value;
    radio.addEventListener("change", () => { onChange(value); });
    const row = document.createElement("label");
    row.className = "pref-row";
    row.append(radio, text);
    return row;
  });
}

function canvasSection(canvas: CanvasPrefs, prefix: string): HTMLElement {
  const section = document.createElement("section");
  const heading = document.createElement("h3");
  heading.textContent = "Canvas";
  const grid = canvas.grid();
  section.append(
    heading,
    checkRow("Show grid", grid.show, (show) => { canvas.setGrid({ show }); }),
    checkRow("Snap to grid", grid.snap, (snap) => { canvas.setGrid({ snap }); }),
  );

  const size = document.createElement("input");
  size.type = "number";
  size.className = "num";
  size.min = String(GRID_SIZE_MIN);
  size.max = String(GRID_SIZE_MAX);
  size.step = "1";
  size.value = String(grid.size);
  size.setAttribute("aria-label", "Grid size");
  size.addEventListener("change", () => {
    const next = parseGridSize(Number(size.value));
    size.value = String(next ?? canvas.grid().size);
    if (next !== null) canvas.setGrid({ size: next });
  });
  const unit = document.createElement("span");
  unit.className = "note";
  unit.textContent = "px";
  const sizeRow = document.createElement("label");
  sizeRow.className = "pref-row";
  sizeRow.append("Grid size", size, unit);

  const wheelLabel = document.createElement("div");
  wheelLabel.className = "note pref-row";
  wheelLabel.textContent = "Mouse wheel";
  section.append(
    sizeRow,
    wheelLabel,
    ...radioRows(`${prefix}-wheel`, canvas.wheel(), [
      ["pan", "Pans the view; Ctrl+wheel zooms"],
      ["zoom", "Zooms the view; Ctrl+wheel pans"],
    ], (mode) => { canvas.setWheel(mode); }),
  );
  return section;
}

function savingSection(saving: SavingPrefs): HTMLElement {
  const section = document.createElement("section");
  const heading = document.createElement("h3");
  heading.textContent = "Saving";
  const current = saving.autosave();
  section.append(
    heading,
    checkRow("Autosave in the library", current.library, (library) => { saving.setAutosave({ library }); }),
    checkRow("Autosave in opened folders", current.opened, (opened) => { saving.setAutosave({ opened }); }),
  );
  return section;
}

function startupSection(startup: StartupPrefs, prefix: string): HTMLElement {
  const section = document.createElement("section");
  const heading = document.createElement("h3");
  heading.textContent = "Startup";
  section.append(
    heading,
    ...radioRows(`${prefix}-launch`, startup.open(), [
      ["last", "Reopen the last project or folder"],
      ["start", "Show the start screen"],
    ], (open) => { startup.setOpen(open); }),
  );
  return section;
}

function shortcutRow({ title, key }: ShortcutRow): HTMLElement {
  const row = document.createElement("div");
  row.className = "kr";
  const name = document.createElement("span");
  name.className = "sp";
  name.textContent = title;
  const badge = document.createElement("span");
  const unset = key === undefined;
  badge.className = unset ? "k muted" : "k";
  badge.textContent = unset ? NOT_SET : key;
  row.append(name, badge);
  return row;
}

function renderShortcutGroups(into: HTMLElement, groups: readonly ShortcutGroup[]): void {
  into.replaceChildren();
  for (const group of groups) {
    const heading = document.createElement("h3");
    heading.textContent = group.title;
    into.append(heading);
    into.append(...group.rows.map(shortcutRow));
  }
}

function shortcutsSection(actions: readonly Action[], mac: boolean): HTMLElement {
  const section = document.createElement("div");
  const search = document.createElement("input");
  search.type = "search";
  search.className = "f";
  search.placeholder = "Search actions or keys";
  search.setAttribute("aria-label", "Search actions or keys");
  const list = document.createElement("div");
  const all = shortcutList(actions, mac);
  const paint = (): void => { renderShortcutGroups(list, filterShortcutList(all, search.value)); };
  search.addEventListener("input", paint);
  paint();
  section.append(search, list);
  return section;
}

/** Shows the warning at the top of the panels while the store has changes it cannot write. */
function warnWhileUnsaved(panels: HTMLElement, store: PreferenceStore): () => void {
  const warning = document.createElement("div");
  warning.className = "err";
  warning.setAttribute("role", "alert");
  warning.textContent = UNSAVED;
  const show = (): void => {
    if (store.unsaved) panels.prepend(warning);
    else warning.remove();
  };
  show();
  return store.watch(show);
}

/** The Preferences dialog, over whatever screen is showing. Resolves when it is closed. */
export async function openPreferences(
  parent: HTMLElement,
  store: PreferenceStore,
  layout: Layout,
  canvas: CanvasPrefs,
  saving: SavingPrefs,
  startup: StartupPrefs,
  actions: readonly Action[],
  mac: boolean,
): Promise<void> {
  const { element, panels } = build(layout, canvas, saving, startup, actions, mac);
  const stop = warnWhileUnsaved(panels, store);
  await openDialog(parent, {
    title: "Preferences",
    body: element,
    choices: [{ label: "Done", kind: "primary" }],
    prepare: (sheet) => { sheet.classList.add("prefs-sheet"); },
  });
  stop();
}
