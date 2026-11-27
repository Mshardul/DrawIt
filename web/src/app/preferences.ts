import { openDialog } from "./dialog.ts";
import { LAYOUT_PARTS, PART_NAMES, type Layout } from "./layout.ts";
import type { PreferenceStore } from "./preference-store.ts";

const UNSAVED = "Preferences can't be saved. Changes last until DrawIt closes.";

const TABS = ["General", "Shortcuts"] as const;

type Tab = (typeof TABS)[number];

let opened = 0;

function build(layout: Layout): { element: HTMLElement; panels: HTMLElement } {
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
    if (name === "General") panel.append(interfaceSection(layout));
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
export async function openPreferences(parent: HTMLElement, store: PreferenceStore, layout: Layout): Promise<void> {
  const { element, panels } = build(layout);
  const stop = warnWhileUnsaved(panels, store);
  await openDialog(parent, {
    title: "Preferences",
    body: element,
    choices: [{ label: "Done", kind: "primary" }],
    prepare: (sheet) => { sheet.classList.add("prefs-sheet"); },
  });
  stop();
}
