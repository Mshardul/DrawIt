import { openDialog } from "./dialog.ts";

const TABS = ["General", "Shortcuts"] as const;

type Tab = (typeof TABS)[number];

let opened = 0;

function build(): HTMLElement {
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
    panels.set(name, panel);
    list.append(button);
    body.append(panel);
  }
  select("General", false);

  const wrap = document.createElement("div");
  wrap.className = "prefs";
  wrap.append(list, body);
  return wrap;
}

/** The Preferences dialog, over whatever screen is showing. Resolves when it is closed. */
export async function openPreferences(parent: HTMLElement): Promise<void> {
  await openDialog(parent, {
    title: "Preferences",
    body: build(),
    choices: [{ label: "Done", kind: "primary" }],
    prepare: (sheet) => { sheet.classList.add("prefs-sheet"); },
  });
}
