// The app's DOM, built by hand (no UI framework). One toolbar, an error banner and the canvas.
// All state lives in the open `OpenFile`; the DOM is redrawn from it.
import { describeDiagram } from "../render/describe.ts";
import { mount } from "../render/mount.ts";
import { type StorageAdapter, StorageError } from "../storage/adapter.ts";
import { type OpenFile, openFile, workspaceFiles } from "./workspace.ts";

const SVG_NS = "http://www.w3.org/2000/svg";

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const element = Object.assign(document.createElement(tag), props);
  element.append(...children);
  return element;
}

export interface Shell {
  /** The open file, or null before one is opened. */
  readonly file: OpenFile | null;
  open(path: string): Promise<void>;
  save(): Promise<void>;
  /** Redraws the canvas and the unsaved indicator from the open file. Call after changing its history. */
  refresh(): void;
}

/** Builds the app in `root`, lists the folder and opens its first diagram if there is one. */
export async function startShell(root: HTMLElement, storage: StorageAdapter): Promise<Shell> {
  const picker = el("select", { ariaLabel: "File" });
  const name = el("span", { className: "name" });
  const unsaved = el("span", { className: "unsaved", textContent: "Unsaved changes", hidden: true });
  const saveButton = el("button", { type: "button", textContent: "Save", disabled: true });
  const error = el("div", { className: "error", hidden: true });
  error.setAttribute("role", "alert");
  const canvas = document.createElementNS(SVG_NS, "svg");
  canvas.setAttribute("class", "canvas");

  root.replaceChildren(
    el("header", { className: "bar" }, el("h1", { textContent: "DrawIt" }), picker, name, unsaved, saveButton),
    error,
    canvas,
  );

  let current: OpenFile | null = null;
  let opening = Promise.resolve();

  const showError = (message: string | null): void => {
    error.hidden = message === null;
    error.textContent = message ?? "";
  };

  const refresh = (): void => {
    mount(canvas, current ? describeDiagram(current.document) : []);
    name.textContent = current?.path ?? "";
    unsaved.hidden = !current?.dirty;
    saveButton.disabled = !current;
  };

  const doOpen = async (path: string): Promise<void> => {
    if (current?.dirty && !confirm(`Discard unsaved changes to ${current.path}?`)) {
      picker.value = current.path;
      return;
    }
    try {
      const result = await openFile(storage, path);
      if (result.ok) {
        current = result.file;
        showError(null);
      } else {
        // Refused: the file stays untouched and the previous file stays open.
        showError(`${path} was not opened: ${result.error.message}`);
        picker.value = current?.path ?? "";
      }
    } catch (e) {
      showError(`${path} was not opened: ${e instanceof StorageError ? e.message : String(e)}`);
      picker.value = current?.path ?? "";
    }
    refresh();
  };

  const shell: Shell = {
    get file() {
      return current;
    },
    open(path) {
      picker.value = path;
      opening = opening.then(() => doOpen(path));
      return opening;
    },
    async save() {
      if (!current) return;
      try {
        await current.save(storage);
        showError(null);
      } catch (e) {
        showError(`${current.path} was not saved: ${e instanceof Error ? e.message : String(e)}`);
      }
      refresh();
    },
    refresh,
  };

  picker.addEventListener("change", () => {
    void shell.open(picker.value);
  });
  saveButton.addEventListener("click", () => void shell.save());
  addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "s") {
      event.preventDefault();
      void shell.save();
    }
  });
  addEventListener("beforeunload", (event) => {
    if (current?.dirty) event.preventDefault();
  });

  const paths = await workspaceFiles(storage);
  picker.replaceChildren(...paths.map((p) => el("option", { value: p, textContent: p })));
  picker.disabled = paths.length === 0;
  if (paths.length === 0) showError("No .drawit.kdl files in this folder.");
  else await shell.open(paths[0] ?? "");
  return shell;
}
