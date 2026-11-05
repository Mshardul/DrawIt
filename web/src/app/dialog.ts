import { isTextEntry } from "./text-entry.ts";

export interface DialogChoice {
  label: string;
  kind?: "primary" | "danger";
  /** Runs instead of closing. Return true to close. */
  commit?: () => Promise<boolean>;
}

export interface DialogRequest {
  title: string;
  body: Node | string;
  choices: DialogChoice[];
  /** Button on the left of the footer, before the spacer. */
  aside?: DialogChoice;
  /** Called after the buttons exist, before focus moves in. */
  prepare?: (sheet: HTMLElement) => void;
}

export interface NoticeRequest {
  /** Bold sentence in front of the body. Included in the accessible name. */
  lead?: string;
  body: string;
  choices: DialogChoice[];
}

const TOOL_KEYS = new Set(["v", "h", "l", "a", "f", "r", "o", "t", "i"]);
const FOCUSABLE = "button, input, select, textarea, a[href]";

let installed = false;
let overlays = 0;
let titleId = 0;

function canvasShortcut(event: KeyboardEvent): boolean {
  if (event.key === "Delete" || event.key === "Backspace" || event.code === "Space" || event.key === " ") return true;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") return true;
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  return event.key.length === 1 && TOOL_KEYS.has(event.key);
}

/** Installed before the canvas listeners, so a field or an open dialog keeps their keys. */
export function installKeyGuard(): void {
  if (installed) return;
  installed = true;
  addEventListener("keydown", (event) => {
    if (overlays === 0 && !isTextEntry(event.target)) return;
    if (!canvasShortcut(event)) return;
    event.stopImmediatePropagation();
  });
}

/** Keeps canvas shortcuts from reaching the diagram until `release` is called. */
export function holdCanvasKeys(): () => void {
  overlays += 1;
  return () => {
    overlays -= 1;
  };
}

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.hasAttribute("disabled"));
}

function button(choice: DialogChoice, onChoose: (label: string) => void): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = choice.kind ? `btn ${choice.kind}` : "btn";
  element.textContent = choice.label;
  element.addEventListener("click", () => {
    const commit = choice.commit;
    if (!commit) {
      onChoose(choice.label);
      return;
    }
    if (element.disabled) return;
    element.disabled = true;
    void commit().then(
      (ok) => { if (ok) onChoose(choice.label); },
      () => { element.disabled = false; },
    );
  });
  return element;
}

function trap(surface: HTMLElement, dismiss: () => void): void {
  surface.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      dismiss();
      return;
    }
    if (event.key !== "Tab") return;
    const items = focusables(surface);
    const first = items[0];
    const last = items.at(-1);
    if (!first || !last) return;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !surface.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

function finishLater(release: () => void, node: HTMLElement, previous: HTMLElement | null, resolve: (value: string | null) => void): (value: string | null) => void {
  let done = false;
  return (value) => {
    if (done) return;
    done = true;
    release();
    node.remove();
    previous?.focus();
    resolve(value);
  };
}

export function openDialog(parent: HTMLElement, request: DialogRequest): Promise<string | null> {
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const release = holdCanvasKeys();
  titleId += 1;
  const id = `dialog-title-${String(titleId)}`;
  const scrim = document.createElement("div");
  scrim.className = "scrim";
  const sheet = document.createElement("div");
  sheet.className = "sheet";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-labelledby", id);
  const heading = document.createElement("div");
  heading.className = "hd";
  heading.id = id;
  heading.textContent = request.title;
  const body = document.createElement("div");
  body.className = "bd";
  if (typeof request.body === "string") body.textContent = request.body;
  else body.append(request.body);
  const foot = document.createElement("div");
  foot.className = "ft";
  const spacer = document.createElement("span");
  spacer.className = "sp";
  sheet.append(heading, body, foot);
  scrim.append(sheet);
  parent.append(scrim);
  return new Promise((resolve) => {
    const finish = finishLater(release, scrim, previous, resolve);
    if (request.aside) foot.append(button(request.aside, finish));
    foot.append(spacer, ...request.choices.map((choice) => button(choice, finish)));
    request.prepare?.(sheet);
    scrim.addEventListener("click", (event) => {
      if (event.target === scrim) finish(null);
    });
    trap(sheet, () => { finish(null); });
    const inBody = focusables(body);
    const preferred = inBody[0] ?? foot.querySelector<HTMLElement>(".btn.primary") ?? focusables(sheet)[0];
    if (preferred) preferred.focus();
    else sheet.focus();
  });
}

export function openNotice(parent: HTMLElement, request: NoticeRequest): Promise<string | null> {
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const release = holdCanvasKeys();
  const notice = document.createElement("div");
  notice.className = "notice";
  notice.setAttribute("role", "dialog");
  notice.setAttribute("aria-modal", "true");
  notice.setAttribute("aria-label", request.lead ? `${request.lead} ${request.body}` : request.body);
  const text = document.createElement("span");
  if (request.lead) {
    const strong = document.createElement("b");
    strong.textContent = request.lead;
    text.append(strong, ` ${request.body}`);
  } else {
    text.textContent = request.body;
  }
  const spacer = document.createElement("span");
  spacer.className = "sp";
  notice.append(text, spacer);
  parent.append(notice);
  return new Promise((resolve) => {
    const finish = finishLater(release, notice, previous, resolve);
    notice.append(...request.choices.map((choice) => button(choice, finish)));
    trap(notice, () => { finish(null); });
    const first = focusables(notice)[0];
    if (first) first.focus();
  });
}
