// The app's DOM, built by hand (no UI framework). One toolbar, an error banner and the canvas.
// All state lives in the open `OpenFile`; the DOM is redrawn from it.
import type { DiagramDocument } from "../model/index.ts";
import type { Box } from "../render/boxes.ts";
import { describeDiagram } from "../render/describe.ts";
import { describeGrid } from "../render/grid.ts";
import { mount, patch } from "../render/mount.ts";
import { describeOverlay } from "../render/overlay.ts";
import { attachTransformInput } from "../move/input.ts";
import { attachSelectInput } from "../select/input.ts";
import { type StorageAdapter, StorageError } from "../storage/adapter.ts";
import { loadFonts } from "../text/fonts.ts";
import { attachTextEdit, type TextEdit } from "../text/edit.ts";
import { createTextMeasurer } from "../text/measure.ts";
import { attachViewInput } from "../view/input.ts";
import { documentBounds, IDENTITY, type View, viewTransform, zoomToFit } from "../view/view.ts";
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

/** Grid display and snap. View settings like pan and zoom: not in history or the file (preferences come later). */
export interface GridSettings {
  show: boolean;
  snap: boolean;
  /** Cell size in world px. */
  size: number;
}

/** Cell sizes offered in the status bar. */
const GRID_SIZES = [4, 8, 16, 32, 64];

export interface Shell {
  /** The open file, or null before one is opened. */
  readonly file: OpenFile | null;
  open(path: string): Promise<void>;
  save(): Promise<void>;
  /** Pan and zoom of the canvas. Not document state: it is not in history or the file. */
  readonly view: View;
  setView(view: View): void;
  /** Grid display, snap and cell size. */
  readonly grid: GridSettings;
  setGrid(change: Partial<GridSettings>): void;
  /** Fits every drawn element in the canvas. */
  fit(): void;
  /** Redraws the canvas and the unsaved indicator from the open file. Call after changing its history. */
  refresh(): void;
}

/** Builds the app in `root`, lists the folder and opens its first diagram if there is one. */
export async function startShell(root: HTMLElement, storage: StorageAdapter): Promise<Shell> {
  await loadFonts();
  const measurer = createTextMeasurer();
  const picker = el("select", { ariaLabel: "File" });
  const name = el("span", { className: "name" });
  const unsaved = el("span", { className: "unsaved", textContent: "Unsaved changes", hidden: true });
  const saveButton = el("button", { type: "button", textContent: "Save", disabled: true });
  const zoom = el("span", { className: "zoom" });
  const gridToggle = el("input", { type: "checkbox" });
  const snapToggle = el("input", { type: "checkbox" });
  const gridSize = el("select", { ariaLabel: "Grid size" }, ...GRID_SIZES.map((n) => el("option", { value: String(n), textContent: String(n) })));
  const status = el(
    "footer",
    { className: "status" },
    zoom,
    el("label", {}, gridToggle, "Grid"),
    el("label", {}, snapToggle, "Snap"),
    el("label", {}, "Grid size", gridSize),
  );
  const error = el("div", { className: "error", hidden: true });
  error.setAttribute("role", "alert");
  const canvas = document.createElementNS(SVG_NS, "svg");
  canvas.setAttribute("class", "canvas");
  // The renderer draws world coordinates into this group; the view transform is its attribute.
  const world = document.createElementNS(SVG_NS, "g");
  world.setAttribute("class", "world");
  const gridLayer = document.createElementNS(SVG_NS, "g");
  gridLayer.setAttribute("class", "grid");
  const elements = document.createElementNS(SVG_NS, "g");
  elements.setAttribute("class", "elements");
  // Selection outlines and the drag-box draw over the elements.
  const overlay = document.createElementNS(SVG_NS, "g");
  overlay.setAttribute("class", "overlay");
  world.append(gridLayer, elements, overlay);
  canvas.append(world);

  root.replaceChildren(
    el("header", { className: "bar" }, el("h1", { textContent: "DrawIt" }), picker, name, unsaved, saveButton),
    error,
    canvas,
    status,
  );

  let current: OpenFile | null = null;
  let view: View = IDENTITY;
  let marquee: Box | null = null;
  let grid: GridSettings = { show: false, snap: false, size: 8 };
  // A drag draws this copy of the document; the file's own document changes only on release.
  let preview: DiagramDocument | null = null;
  let opening = Promise.resolve();
  // The element whose text an editor is showing; the renderer leaves that text out.
  let editing: string | null = null;
  let textEdit: TextEdit | null = null;

  const showError = (message: string | null): void => {
    error.hidden = message === null;
    error.textContent = message ?? "";
  };

  const drawOverlay = (): void => {
    const doc = preview ?? current?.document;
    mount(overlay, current && doc ? describeOverlay(doc, measurer, current.history.selection, marquee, view.scale) : []);
  };

  const redraw = (changed?: ReadonlySet<string>): void => {
    const doc = preview ?? current?.document;
    const hideText = editing === null ? undefined : new Set([editing]);
    if (changed && doc) patch(elements, describeDiagram(doc, measurer, { only: changed, ...(hideText && { hideText }) }));
    else mount(elements, doc ? describeDiagram(doc, measurer, hideText && { hideText }) : []);
    drawOverlay();
  };

  const refresh = (changed?: ReadonlySet<string>): void => {
    redraw(changed);
    name.textContent = current?.path ?? "";
    unsaved.hidden = !current?.dirty;
    saveButton.disabled = !current;
  };

  const drawGrid = (): void => {
    mount(gridLayer, grid.show ? describeGrid(grid.size, view.scale) : []);
  };
  const setGrid = (change: Partial<GridSettings>): void => {
    grid = { ...grid, ...change };
    gridToggle.checked = grid.show;
    snapToggle.checked = grid.snap;
    gridSize.value = String(grid.size);
    drawGrid();
  };

  const setView = (next: View): void => {
    view = next;
    world.setAttribute("transform", viewTransform(view));
    zoom.textContent = `${String(Math.round(view.scale * 100))}%`;
    drawGrid();
    // Handles keep their screen size, so they depend on the scale.
    drawOverlay();
    textEdit?.reposition();
  };
  const fit = (): void => {
    const box = canvas.getBoundingClientRect();
    setView(zoomToFit(current ? documentBounds(current.document, measurer) : null, { w: box.width, h: box.height }, 48));
  };

  const doOpen = async (path: string): Promise<void> => {
    if (current?.dirty && !confirm(`Discard unsaved changes to ${current.path}?`)) {
      picker.value = current.path;
      return;
    }
    textEdit?.close();
    try {
      const result = await openFile(storage, path, measurer);
      if (result.ok) {
        current = result.file;
        showError(null);
        fit();
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
    get view() {
      return view;
    },
    setView,
    get grid() {
      return grid;
    },
    setGrid,
    fit,
    refresh,
  };
  setView(IDENTITY);
  setGrid({});
  attachSelectInput({
    target: canvas,
    getView: () => view,
    getFile: () => current,
    measurer,
    setMarquee: (box) => {
      marquee = box;
    },
    refresh,
  });
  attachTransformInput({
    target: canvas,
    getView: () => view,
    getFile: () => current,
    measurer,
    getGrid: () => (grid.snap ? grid.size : 0),
    setPreview: (doc) => {
      preview = doc;
    },
    redraw: (changed) => { redraw(changed); },
    refresh,
  });
  textEdit = attachTextEdit({
    target: canvas,
    parent: root,
    getView: () => view,
    getFile: () => current,
    measurer,
    setEditing: (id) => {
      editing = id;
    },
    refresh,
  });
  attachViewInput({
    target: canvas,
    getView: () => view,
    setView,
    getBounds: () => (current ? documentBounds(current.document, measurer) : null),
  });

  picker.addEventListener("change", () => {
    void shell.open(picker.value);
  });
  saveButton.addEventListener("click", () => void shell.save());
  gridToggle.addEventListener("change", () => { setGrid({ show: gridToggle.checked }); gridToggle.blur(); });
  snapToggle.addEventListener("change", () => { setGrid({ snap: snapToggle.checked }); snapToggle.blur(); });
  gridSize.addEventListener("change", () => { setGrid({ size: Number(gridSize.value) }); gridSize.blur(); });
  addEventListener("keydown", (event) => {
    const t = event.target;
    if (t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement) return;
    if (event.metaKey || event.ctrlKey || event.altKey || event.key.toLowerCase() !== "g") return;
    event.preventDefault();
    if (event.shiftKey) setGrid({ snap: !grid.snap });
    else setGrid({ show: !grid.show });
  });
  addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "s") {
      event.preventDefault();
      void shell.save();
    }
  });
  addEventListener("keydown", (event) => {
    const t = event.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) return;
    if (!current || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
    event.preventDefault();
    if (event.shiftKey ? current.history.redo() : current.history.undo()) refresh();
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
