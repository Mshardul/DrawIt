// The style panel: one row per property of the selection, built from the property registry.
// It holds no state of its own; every edit goes through the style commands and the panel is
// redrawn from the document.
import type { OpenFile } from "../app/workspace.ts";
import { type Command, CommandError } from "../commands/command.ts";
import { clearStyle, setStyle } from "./commands.ts";
import { RecentColours, themeTokens } from "./colours.ts";
import { type FieldValue, type PanelField, panelFields } from "./panel-model.ts";

export interface StylePanelHost {
  getFile(): OpenFile | null;
  /** Redraws the canvas and the unsaved indicator after the document changed. */
  refresh(): void;
}

export interface StylePanel {
  element: HTMLElement;
  /** Shows the fields of the current selection. */
  update(): void;
}

interface Row {
  field: PanelField;
  input: HTMLInputElement;
  clear: HTMLButtonElement;
  /** Colour properties only: the button that opens the picker and the picker itself. */
  pick?: HTMLButtonElement;
  picker?: HTMLElement;
}

const SVG_NS = "http://www.w3.org/2000/svg";

function swatch(colour: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("aria-hidden", "true");
  const rect = document.createElementNS(SVG_NS, "rect");
  for (const [name, value] of Object.entries({ x: "0.5", y: "0.5", width: "15", height: "15", fill: colour, stroke: "#888" })) rect.setAttribute(name, value);
  svg.append(rect);
  return svg;
}

const text = (value: FieldValue): string =>
  value.state === "same" && (typeof value.value === "string" || typeof value.value === "number") ? String(value.value) : "";

export function createStylePanel(host: StylePanelHost): StylePanel {
  const element = document.createElement("aside");
  element.className = "style-panel";
  element.setAttribute("aria-label", "Style");
  let rows: Row[] = [];
  let shown = "";
  const recent = new RecentColours();

  const closePickers = (): void => {
    for (const row of rows) if (row.picker) row.picker.hidden = true;
  };

  const apply = (command: Command): void => {
    const file = host.getFile();
    if (!file) return;
    try {
      file.history.execute(command);
    } catch (e) {
      if (!(e instanceof CommandError)) throw e;
    }
    host.refresh();
  };

  const commit = (row: Row): void => {
    const { field, input } = row;
    const raw = input.value.trim();
    if (raw === "") {
      input.removeAttribute("aria-invalid");
      if (field.overridden) apply(clearStyle(field.ids, [field.def.key]));
      return;
    }
    const value = field.def.type === "number" ? Number(raw) : raw;
    if (!field.def.accepts(value)) {
      input.setAttribute("aria-invalid", "true");
      return;
    }
    input.removeAttribute("aria-invalid");
    apply(setStyle(field.ids, { [field.def.key]: value }));
  };

  const choose = (row: Row, colour: string): void => {
    recent.add(colour);
    apply(setStyle(row.field.ids, { [row.field.def.key]: colour }));
    closePickers();
  };

  const colourButton = (row: Row, label: string, colour: string): HTMLButtonElement => {
    const button = document.createElement("button");
    button.type = "button";
    button.ariaLabel = label;
    button.title = label;
    button.append(swatch(colour));
    button.addEventListener("click", () => { choose(row, label); });
    return button;
  };

  const group = (name: string, ...children: Node[]): HTMLElement => {
    const box = document.createElement("div");
    box.setAttribute("role", "group");
    box.ariaLabel = name;
    box.className = "colour-group";
    box.append(...children);
    return box;
  };

  const openPicker = (row: Row): void => {
    const { picker } = row;
    const file = host.getFile();
    if (!picker || !file) return;
    const name = row.field.def.name;
    const custom = document.createElement("input");
    custom.type = "color";
    custom.ariaLabel = `Custom ${name}`;
    custom.addEventListener("change", () => { choose(row, custom.value); });
    const sections = [
      group("Theme", ...themeTokens(file.document).map((t) => colourButton(row, t.token, t.colour))),
    ];
    const used = recent.list();
    if (used.length > 0) sections.push(group("Recent", ...used.map((c) => colourButton(row, c, c))));
    picker.replaceChildren(...sections, custom);
    closePickers();
    picker.hidden = false;
  };

  const build = (field: PanelField): Row => {
    const input = document.createElement("input");
    input.type = field.def.type === "number" ? "number" : "text";
    if (field.def.type === "number") {
      if (field.def.min !== undefined) input.min = String(field.def.min);
      if (field.def.max !== undefined) input.max = String(field.def.max);
      input.step = field.def.max === 1 ? "0.05" : "1";
    }
    input.setAttribute("aria-label", field.def.name);
    const clear = document.createElement("button");
    clear.type = "button";
    clear.textContent = "Clear";
    clear.ariaLabel = `Clear ${field.def.name}`;
    const row: Row = { field, input, clear };
    if (field.def.type === "colour" || field.def.type === "fill") {
      const pick = document.createElement("button");
      pick.type = "button";
      pick.textContent = "Pick";
      pick.ariaLabel = `Pick ${field.def.name}`;
      const picker = document.createElement("div");
      picker.setAttribute("role", "group");
      picker.ariaLabel = `${field.def.name} colours`;
      picker.className = "colour-picker";
      picker.hidden = true;
      row.pick = pick;
      row.picker = picker;
      pick.addEventListener("click", () => { if (picker.hidden) openPicker(row); else closePickers(); });
    }
    input.addEventListener("change", () => { commit(row); });
    clear.addEventListener("click", () => { apply(clearStyle(row.field.ids, [row.field.def.key])); });
    return row;
  };

  const show = (row: Row, field: PanelField): void => {
    row.field = field;
    const mixed = field.value.state === "mixed";
    row.input.value = text(field.value);
    row.input.placeholder = mixed ? "Mixed" : "none";
    row.input.removeAttribute("aria-invalid");
    row.clear.hidden = !field.overridden;
  };

  element.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closePickers();
  });

  return {
    element,
    update() {
      const file = host.getFile();
      const fields = file ? panelFields(file.document, file.history.selection) : [];
      const signature = fields.map((f) => f.def.key).join();
      if (signature !== shown) {
        shown = signature;
        rows = fields.map(build);
        element.replaceChildren(
          ...rows.map((row) => {
            const label = document.createElement("label");
            label.append(row.field.def.name, row.input);
            const line = document.createElement("div");
            line.className = "style-row";
            line.append(label, ...(row.pick ? [row.pick] : []), row.clear);
            const cell = document.createElement("div");
            cell.append(line, ...(row.picker ? [row.picker] : []));
            return cell;
          }),
        );
      }
      rows.forEach((row, i) => { const field = fields[i]; if (field) show(row, field); });
      element.hidden = fields.length === 0;
    },
  };
}
