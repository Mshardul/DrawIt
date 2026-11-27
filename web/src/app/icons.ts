import { setTip } from "./tooltip.ts";

const SVG_NS = "http://www.w3.org/2000/svg";

const SHAPES = {
  select: '<path d="M5 3l11 7.5-5 .8-2.7 4.7z"/>',
  hand: '<path d="M6.5 11.5V5.2a1.2 1.2 0 012.4 0V9.5M8.9 9.5V3.8a1.2 1.2 0 012.4 0v5.7M11.3 9.5V4.8a1.2 1.2 0 012.4 0v4.9M13.7 9.7V7a1.2 1.2 0 012.4 0v4.8c0 3.6-2 5.9-5.2 5.9-2.4 0-3.7-1-5-3L3.7 11.3a1.2 1.2 0 011.9-1.4l.9 1.1"/>',
  rect: '<rect x="3" y="5" width="14" height="10" rx="1"/>',
  ellipse: '<ellipse cx="10" cy="10" rx="7.2" ry="5.5"/>',
  line: '<path d="M4 16L16 4"/>',
  arrow: '<path d="M4 16L16 4M9 4h7v7"/>',
  text: '<path d="M4 6.5V4h12v2.5M10 4v12M7.5 16h5"/>',
  frame: '<path d="M6 2.5v15M14 2.5v15M2.5 6h15M2.5 14h15"/>',
  image: '<rect x="3" y="4" width="14" height="12" rx="1"/><circle cx="7.3" cy="8" r="1.4"/><path d="M4 15l4.7-4.7 3.1 3.1 2-2L17 14.6"/>',
  home: '<path d="M3.5 9L10 3.5 16.5 9M5.5 8v8.5h9V8"/>',
  undo: '<path d="M7 5L3.5 8.5 7 12M4 8.5h8a4 4 0 010 8h-2"/>',
  redo: '<path d="M13 5l3.5 3.5L13 12M16 8.5H8a4 4 0 000 8h2"/>',
  export: '<path d="M10 12.5V3M6.5 6.5L10 3l3.5 3.5M4 11.5V17h12v-5.5"/>',
  gear: '<path d="M8.7 2.5h2.6l.4 2.1 1.5.9 2-.7 1.3 2.3-1.6 1.4v3l1.6 1.4-1.3 2.3-2-.7-1.5.9-.4 2.1H8.7l-.4-2.1-1.5-.9-2 .7-1.3-2.3 1.6-1.4v-3L3.5 7.1l1.3-2.3 2 .7 1.5-.9z"/><circle cx="10" cy="10" r="2.4"/>',
  import: '<path d="M10 3v9.5M6.5 9l3.5 3.5L13.5 9M4 11.5V17h12v-5.5"/>',
  folderOpen: '<path d="M2.5 15.5v-11h5L9 6.5h6.5V9M2.5 15.5L5 9h13l-2.5 6.5z"/>',
  newDiagram: '<path d="M11.5 2.5H5v15h10V6zM11.5 2.5V6H15M10 9v5M7.5 11.5h5"/>',
  newProject: '<path d="M2.5 4.5h5L9 6.5h8.5v10h-15zM10 9v5M7.5 11.5h5"/>',
  rename: '<path d="M4 16l.8-3.5 8.7-8.7a1.9 1.9 0 012.7 2.7l-8.7 8.7zM12 5.3L14.7 8"/>',
  zoomOut: '<path d="M5 10h10"/>',
  zoomIn: '<path d="M5 10h10M10 5v10"/>',
  grid: '<path d="M4 4h12v12H4zM8 4v12M12 4v12M4 8h12M4 12h12"/>',
  snap: '<path d="M5 4v6a5 5 0 0010 0V4M5 7h3M12 7h3M8 4v6a2 2 0 004 0V4M5 4h3M12 4h3"/>',
  alignLeft: '<path d="M3 2.5v15"/><rect x="5.5" y="5" width="11" height="3.5" rx="1"/><rect x="5.5" y="11.5" width="7" height="3.5" rx="1"/>',
  alignCentre: '<path d="M10 2.5V5M10 8.5v3M10 15v2.5"/><rect x="4" y="5" width="12" height="3.5" rx="1"/><rect x="6" y="11.5" width="8" height="3.5" rx="1"/>',
  alignRight: '<path d="M17 2.5v15"/><rect x="3.5" y="5" width="11" height="3.5" rx="1"/><rect x="7.5" y="11.5" width="7" height="3.5" rx="1"/>',
  alignTop: '<path d="M2.5 3h15"/><rect x="5" y="5.5" width="3.5" height="11" rx="1"/><rect x="11.5" y="5.5" width="3.5" height="7" rx="1"/>',
  alignMiddle: '<path d="M2.5 10H5M8.5 10h3M15 10h2.5"/><rect x="5" y="4" width="3.5" height="12" rx="1"/><rect x="11.5" y="6" width="3.5" height="8" rx="1"/>',
  alignBottom: '<path d="M2.5 17h15"/><rect x="5" y="3.5" width="3.5" height="11" rx="1"/><rect x="11.5" y="7.5" width="3.5" height="7" rx="1"/>',
  distributeH: '<path d="M3 2.5v15M17 2.5v15"/><rect x="8" y="5.5" width="4" height="9" rx="1"/>',
  distributeV: '<path d="M2.5 3h15M2.5 17h15"/><rect x="5.5" y="8" width="9" height="4" rx="1"/>',
  toFront: '<path d="M12.5 7V3H3v9.5h4"/><rect x="7" y="7" width="10" height="10" rx="1" class="fl"/>',
  toBack: '<path d="M3 3h9.5v4H7v5.5H3z" class="fl"/><rect x="7" y="7" width="10" height="10" rx="1"/>',
  locked: '<rect x="4.5" y="9" width="11" height="8" rx="1"/><path d="M7 9V6.5a3 3 0 016 0V9"/>',
  unlocked: '<rect x="4.5" y="9" width="11" height="8" rx="1"/><path d="M7 9V6a3 3 0 015.9-.8"/>',
  pickColour: '<path d="M10 3a7 7 0 100 14c1.4 0 1.7-.9 1.2-1.8-.6-1.1.2-2.2 1.5-2.2H15a2 2 0 002-2c0-4.4-3.1-8-7-8z"/><circle cx="6.5" cy="10" r="0.9" class="fl"/><circle cx="8.3" cy="6.6" r="0.9" class="fl"/><circle cx="12.2" cy="6.6" r="0.9" class="fl"/>',
  clear: '<path d="M6 6l8 8M14 6l-8 8"/>',
} as const;

export type IconName = keyof typeof SHAPES;

export function icon(name: IconName): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "icon");
  svg.setAttribute("viewBox", "0 0 20 20");
  svg.setAttribute("aria-hidden", "true");
  svg.dataset["icon"] = name;
  svg.innerHTML = SHAPES[name];
  return svg;
}

/** Turns a button into an icon, with `label` as its name and tooltip. */
export function iconButton(button: HTMLButtonElement, name: IconName, label: string, action?: string): void {
  button.replaceChildren(icon(name));
  button.classList.add("icon-button");
  button.setAttribute("aria-label", label);
  setTip(button, label, action);
}

/** A checkbox drawn as one or two icons; the stylesheet picks which of two shows. */
export function iconToggle(box: HTMLInputElement, label: string, icons: readonly IconName[], action?: string): HTMLLabelElement {
  const toggle = document.createElement("label");
  toggle.className = "icon-toggle";
  box.setAttribute("aria-label", label);
  toggle.append(box, ...icons.map(icon));
  setTip(toggle, label, action);
  return toggle;
}
