// Whether a key event came from a control where the user is typing text, so the app leaves the
// key (undo, delete, shortcuts) to the browser. A checkbox, button or colour input is not one.
const NOT_TEXT = new Set(["checkbox", "radio", "button", "submit", "reset", "color", "range", "file", "image"]);

export function isTextEntry(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLInputElement && !NOT_TEXT.has(target.type);
}
