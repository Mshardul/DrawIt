import { holdCanvasKeys } from "./dialog.ts";

const TITLE = "DrawIt is open in another tab";
const NOTE = "Only one tab can edit at a time, so nothing gets written to the wrong place.";

/** Covers the app until Use here succeeds. The document underneath stays as it is. */
export function showElsewhere(parent: HTMLElement, onUseHere: () => Promise<void> | void): void {
  if (parent.querySelector(".elsewhere")) return;
  const release = holdCanvasKeys();
  const screen = document.createElement("div");
  screen.className = "elsewhere";
  const title = document.createElement("h2");
  title.textContent = TITLE;
  const note = document.createElement("p");
  note.textContent = NOTE;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn primary";
  button.textContent = "Use here";
  let pending = false;
  button.addEventListener("click", () => {
    if (pending) return;
    pending = true;
    button.disabled = true;
    void Promise.resolve()
      .then(onUseHere)
      .then(() => {
        release();
        screen.remove();
      })
      .catch(() => {
        pending = false;
        button.disabled = false;
      });
  });
  screen.append(title, note, button);
  parent.append(screen);
  button.focus();
}
