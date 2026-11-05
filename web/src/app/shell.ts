// The app's DOM, built by hand (no UI framework). One toolbar, an error banner and the canvas.
// All state lives in the open `OpenFile`; the DOM is redrawn from it.
import { attachEdgeInput } from "../connectors/input.ts";
import { attachBendInput } from "../connectors/bend-input.ts";
import { attachLabelInput } from "../connectors/label-input.ts";
import { attachReattachInput } from "../connectors/reattach-input.ts";
import { attachEditInput } from "../edit/input.ts";
import { dispatchKey, editorActions } from "./actions.ts";
import { installKeyGuard, openDialog } from "./dialog.ts";
import { isTextEntry } from "./text-entry.ts";
import { defaultSize } from "../library/preview.ts";
import { attachPlaceInput } from "../library/input.ts";
import { newShapeCommand, type PlacedShape } from "../library/place.ts";
import { newFrameCommand } from "../frames/place.ts";
import { createLibrarySidebar } from "../library/sidebar.ts";
import type { DiagramDocument, Point } from "../model/index.ts";
import type { Box } from "../render/boxes.ts";
import { countShadowed, describeDefs, SHADOW_DRAG_LIMIT } from "../render/defs.ts";
import { SHAPE_H, SHAPE_W } from "../render/size.ts";
import { describeDiagram, type SvgNode } from "../render/describe.ts";
import { describeGrid } from "../render/grid.ts";
import { addImage, measureInBrowser } from "../images/add.ts";
import { attachImageInput } from "../images/input.ts";
import { decodeInBrowser, ImageStore } from "../images/store.ts";
import { useImages } from "../render/images.ts";
import { mount, patch } from "../render/mount.ts";
import { describeOverlay } from "../render/overlay.ts";
import { attachTransformInput } from "../move/input.ts";
import { attachSelectInput } from "../select/input.ts";
import { type FileInfo, type Preferences, type StorageAdapter, StorageError, writeText } from "../storage/adapter.ts";
import { bundledLoader } from "../shapes/bundled-packs.ts";
import { createStylePanel } from "../style/panel.ts";
import { loadFonts } from "../text/fonts.ts";
import { attachTextEdit, type TextEdit } from "../text/edit.ts";
import { createTextMeasurer } from "../text/measure.ts";
import { createTextCommand, newTextId } from "../text/target.ts";
import { attachViewInput, ZOOM_STEP } from "../view/input.ts";
import { documentBounds, IDENTITY, screenToWorld, type View, viewTransform, zoomAt, zoomToFit } from "../view/view.ts";
import { watchChanges } from "./changes.ts";
import { cardFace, ThumbnailCache, type CardFace } from "./thumbnail.ts";
import type { Tool } from "./tool.ts";
import { clampToolbar, readToolbar, TOOLBAR_BOTTOM } from "./toolbar.ts";
import { askMove, askName } from "./create.ts";
import { askBrowse, askImport } from "./pick.ts";
import { homeModel, type ProjectCard, type RecentCard } from "./home.ts";
import { landingModel, listingSignature, recordOpened, reviseRecent, watchListing, type LandingCard, type RecentEdit } from "./landing.ts";
import { moveToProject } from "./move.ts";
import { diagramNameCheck, projectNameCheck } from "./names.ts";
import { deleteWording } from "./remove.ts";
import { enterWorkspace, type EditorSession } from "./session.ts";
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

/** Grid display and snap. View settings like pan and zoom: not in history or the file. */
export interface GridSettings {
  show: boolean;
  snap: boolean;
  /** Cell size in world px. */
  size: number;
}

/** Cell sizes offered in the status bar. */
const GRID_SIZES = [4, 8, 16, 32, 64];

/** What the shell shows before a diagram is opened. */
export type FirstScreen = "file" | "landing" | "home";

export interface StartOptions {
  /** Defaults to a file, which opens the folder's first diagram. */
  show?: FirstScreen;
}

export interface Shell {
  /** The screen chosen at startup. */
  readonly screen: FirstScreen;
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

/** Builds the app in `root`. A file start lists the folder and opens its first diagram. */
export async function startShell(root: HTMLElement, storage: StorageAdapter, options: StartOptions = {}): Promise<Shell> {
  const screen = options.show ?? "file";
  await loadFonts();
  const measurer = createTextMeasurer();
  const thumbs = new ThumbnailCache({
    read: (path) => storage.read(path),
    images: () => () => ({ status: "loading" }),
  }, measurer);
  // Files finish loading one by one; one redraw covers those that finish together.
  let imagesChanged = false;
  const images = new ImageStore({
    storage,
    onChange: () => {
      if (imagesChanged) return;
      imagesChanged = true;
      queueMicrotask(() => {
        imagesChanged = false;
        refresh();
      });
    },
    decode: decodeInBrowser,
    createUrl: (blob) => URL.createObjectURL(blob),
    revokeUrl: (url) => { URL.revokeObjectURL(url); },
  });
  useImages(images.lookup);
  const session: EditorSession = {
    storage,
    images,
    file: null,
    info: { id: "", kind: "", path: "" },
  };
  const fileName = el("span", { className: "name" });
  const undoButton = el("button", { type: "button", textContent: "Undo", disabled: true });
  const redoButton = el("button", { type: "button", textContent: "Redo", disabled: true });
  const saveState = el("button", { type: "button", textContent: "Saved", disabled: true });
  const pillHome = el("button", { type: "button", textContent: "Home" });
  const filePill = el("div", { className: "pill" }, pillHome, fileName, undoButton, redoButton, saveState);
  const toolButtons = {
    select: el("button", { type: "button", textContent: "Select", title: "Select (V)", ariaPressed: "true" }),
    hand: el("button", { type: "button", textContent: "Hand", title: "Hand (H)" }),
    rect: el("button", { type: "button", textContent: "Rectangle", title: "Rectangle (R)" }),
    ellipse: el("button", { type: "button", textContent: "Ellipse", title: "Ellipse (O)" }),
    line: el("button", { type: "button", textContent: "Line", title: "Line (L)" }),
    arrow: el("button", { type: "button", textContent: "Arrow", title: "Arrow (A)" }),
    text: el("button", { type: "button", textContent: "Text", title: "Text (T)" }),
    frame: el("button", { type: "button", textContent: "Frame", title: "Frame (F)" }),
    image: el("button", { type: "button", textContent: "Image", title: "Image (I)" }),
  };
  const grip = el("button", { type: "button", className: "grip", ariaLabel: "Move toolbar" });
  const sep = (): HTMLSpanElement => el("span", { className: "sep" });
  const toolbar = el(
    "div",
    { className: "toolbar" },
    grip,
    toolButtons.select,
    toolButtons.hand,
    sep(),
    toolButtons.rect,
    toolButtons.ellipse,
    sep(),
    toolButtons.line,
    toolButtons.arrow,
    sep(),
    toolButtons.text,
    toolButtons.frame,
    sep(),
    toolButtons.image,
  );
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "Tools");
  const imageInput = el("input", { type: "file", accept: "image/*", ariaLabel: "Image file" });
  imageInput.hidden = true;
  // `shown` is stored for a later preference. The toolbar stays on screen.
  let toolbarOffset = { x: 0, y: 0 };
  let toolbarShown = true;
  const zoom = el("span", { className: "zoom" });
  const gridToggle = el("input", { type: "checkbox" });
  const snapToggle = el("input", { type: "checkbox" });
  const gridSize = el("select", { ariaLabel: "Grid size" }, ...GRID_SIZES.map((n) => el("option", { value: String(n), textContent: String(n) })));
  const status = el(
    "footer",
    { className: "status", hidden: screen !== "file" },
    zoom,
    el("label", {}, gridToggle, "Grid"),
    el("label", {}, snapToggle, "Snap"),
    el("label", {}, "Grid size", gridSize),
  );
  const stylePanel = createStylePanel({ getFile: () => session.file, measurer, refresh: () => { refresh(); } });
  const library = createLibrarySidebar({
    loader: bundledLoader,
    measurer,
    onPick: (entry) => {
      if (tool === "shape" && armed?.shape === entry.shape) {
        setTool("select");
        return;
      }
      armed = { shape: entry.shape, size: defaultSize(entry, bundledLoader) };
      setTool("shape");
      library.setArmed(entry.shape);
    },
  });
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
  const defs = document.createElementNS(SVG_NS, "defs");
  // Selection outlines and the drag-box draw over the elements.
  const overlay = document.createElementNS(SVG_NS, "g");
  overlay.setAttribute("class", "overlay");
  world.append(gridLayer, elements, overlay);
  canvas.append(defs, world);

  const importButton = el("button", { type: "button", className: "btn", textContent: "Import" });
  const folderButton = el("button", { type: "button", className: "btn", textContent: "Open folder…" });
  const boardNav = el("div", { className: "nav", hidden: screen !== "home" }, importButton, folderButton);
  const listing = el("nav", { className: "listing", hidden: screen === "file" });
  listing.setAttribute("aria-label", screen === "home" ? "Home" : "Files");
  const canvasWrap = el("div", { className: "stage" }, canvas, filePill, toolbar, imageInput);
  const stage = el("div", { className: "workspace", hidden: screen !== "file" }, library.element, canvasWrap, stylePanel.element);
  root.replaceChildren(
    el("header", { className: "bar" }, el("h1", { textContent: "DrawIt" }), boardNav),
    error,
    listing,
    stage,
    status,
  );

  let view: View = IDENTITY;
  let marquee: Box | null = null;
  let tool: Tool = "select";
  // The shape the shape tool places.
  let armed: PlacedShape | null = null;
  // The line of an edge being drawn, shown over everything until it is released.
  let draft: Point[] | null = null;
  // The box of a shape being sized, drawn like the drag-box.
  let shapeDraft: Box | null = null;
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
    const doc = preview ?? session.file?.document;
    mount(overlay, session.file && doc ? describeOverlay(doc, measurer, session.file.history.selection, marquee ?? shapeDraft, view.scale, draft) : []);
  };

  const redraw = (changed?: ReadonlySet<string>): void => {
    const doc = preview ?? session.file?.document;
    const hideText = editing === null ? undefined : new Set([editing]);
    if (changed && doc) {
      // Shadow filters are what a drag of many shadowed elements cannot repaint in time; the release redraws them.
      const plain = preview !== null && countShadowed(doc, changed) > SHADOW_DRAG_LIMIT;
      patch(elements, describeDiagram(doc, measurer, { only: changed, ...(hideText && { hideText }), ...(plain && { plain }) }));
    } else {
      mount(defs, doc ? describeDefs(doc) : []);
      mount(elements, doc ? describeDiagram(doc, measurer, hideText && { hideText }) : []);
    }
    drawOverlay();
  };

  const refresh = (changed?: ReadonlySet<string>): void => {
    redraw(changed);
    fileName.textContent = session.file?.path ?? "";
    const dirty = session.file?.dirty === true;
    saveState.textContent = dirty ? "Not saved" : "Saved";
    saveState.classList.toggle("dirty", dirty);
    saveState.disabled = session.file === null;
    undoButton.disabled = session.file?.history.canUndo !== true;
    redoButton.disabled = session.file?.history.canRedo !== true;
    stylePanel.update();
  };

  const placeToolbar = (): void => {
    const bounds = canvasWrap.getBoundingClientRect();
    const bar = toolbar.getBoundingClientRect();
    if (bounds.width === 0 || bar.width === 0) return;
    const shown = clampToolbar(toolbarOffset, { w: bounds.width, h: bounds.height }, { w: bar.width, h: bar.height });
    if (shown.x === 0 && shown.y === 0) {
      toolbar.style.left = "";
      toolbar.style.top = "";
      toolbar.style.bottom = "";
      toolbar.style.transform = "";
      return;
    }
    const left = (bounds.width - bar.width) / 2 + shown.x;
    const top = bounds.height - bar.height - TOOLBAR_BOTTOM - shown.y;
    toolbar.style.left = `${String(left)}px`;
    toolbar.style.top = `${String(top)}px`;
    toolbar.style.bottom = "auto";
    toolbar.style.transform = "none";
  };
  const saveToolbar = (): void => {
    void storage.patchPreferences({ toolbar: { x: toolbarOffset.x, y: toolbarOffset.y, shown: toolbarShown } });
  };

  const setTool = (next: Tool): void => {
    const sameShape = (next === "rect" || next === "ellipse") && tool === "shape" && armed?.shape === next;
    const sameTool = next === tool && next !== "shape" && next !== "select";
    const chosen: Tool = sameShape || sameTool ? "select" : next;
    if (chosen === "rect" || chosen === "ellipse") {
      armed = { shape: chosen, size: { w: SHAPE_W, h: SHAPE_H } };
      tool = "shape";
      library.setArmed(chosen);
    } else {
      tool = chosen;
      if (chosen !== "shape") {
        armed = null;
        library.setArmed(null);
      }
    }
    const pressed = tool === "shape" ? armed?.shape ?? "" : tool;
    for (const [which, button] of Object.entries(toolButtons)) button.setAttribute("aria-pressed", String(which === pressed));
    canvas.classList.toggle("drawing", tool !== "select" && tool !== "hand");
    canvas.classList.toggle("hand", tool === "hand");
    if (chosen === "image") imageInput.click();
    draft = null;
    shapeDraft = null;
    drawOverlay();
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
    setView(zoomToFit(session.file ? documentBounds(session.file.document, measurer) : null, { w: box.width, h: box.height }, 48));
  };

  const showEditor = (): void => {
    listing.hidden = true;
    stage.hidden = false;
    status.hidden = false;
    boardNav.hidden = true;
    placeToolbar();
  };
  const showBoard = (which: "home" | "landing"): void => {
    listing.hidden = false;
    listing.setAttribute("aria-label", which === "home" ? "Home" : "Files");
    stage.hidden = true;
    status.hidden = true;
    boardNav.hidden = which !== "home";
  };

  let stopWatch = (): void => {};
  let stopListing = (): void => {};
  let listingGeneration = 0;
  const endListing = (): void => {
    listingGeneration += 1;
    stopListing();
    stopListing = () => {};
  };
  const readPrefs = async (): Promise<Preferences> => {
    try {
      return await storage.readPreferences();
    } catch {
      // A missing preferences file still shows the folder.
      return {};
    }
  };
  const follow = (file: OpenFile): void => {
    stopWatch();
    stopWatch = watchChanges(file, storage, {
      measurer,
      visible: () => document.visibilityState !== "hidden",
      onReload: () => {
        refresh();
      },
    });
  };
  const doOpen = async (path: string): Promise<void> => {
    if (session.file?.dirty && !confirm(`Discard unsaved changes to ${session.file.path}?`)) return;
    textEdit?.close();
    try {
      const result = await openFile(storage, path, measurer);
      if (result.ok) {
        endListing();
        session.file = result.file;
        try {
          const patch = recordOpened(await readPrefs(), session.info, path);
          if (Object.keys(patch).length > 0) await storage.patchPreferences(patch);
        } catch {
          // The diagram opens even when the recent list cannot be saved.
        }
        follow(result.file);
        images.setBase(path);
        showError(null);
        showEditor();
        fit();
      } else {
        // Refused: the file stays untouched and the previous file stays open.
        showError(`${path} was not opened: ${result.error.message}`);
      }
    } catch (e) {
      showError(`${path} was not opened: ${e instanceof StorageError ? e.message : String(e)}`);
    }
    refresh();
  };

  const shell: Shell = {
    screen,
    get file() {
      return session.file;
    },
    open(path) {
      opening = opening.then(() => doOpen(path));
      return opening;
    },
    async save() {
      if (!session.file) return;
      try {
        await session.file.save(storage);
        showError(null);
      } catch (e) {
        showError(`${session.file.path} was not saved: ${e instanceof Error ? e.message : String(e)}`);
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
  setTool("select");
  installKeyGuard();
  // Before selection: an Alt-click adds a bend point only to an edge that was already selected, and
  // the selection input changes the selection on the same press.
  attachBendInput({
    target: canvas,
    getView: () => view,
    getFile: () => session.file,
    measurer,
    getTool: () => tool,
    setPreview: (doc) => {
      preview = doc;
    },
    redraw: (changed) => { redraw(changed); },
    refresh,
  });
  attachSelectInput({
    target: canvas,
    getView: () => view,
    getFile: () => session.file,
    measurer,
    getTool: () => tool,
    setMarquee: (box) => {
      marquee = box;
    },
    refresh,
  });
  attachEditInput({ getFile: () => session.file, measurer, refresh });
  attachTransformInput({
    target: canvas,
    getView: () => view,
    getFile: () => session.file,
    measurer,
    getTool: () => tool,
    getGrid: () => (grid.snap ? grid.size : 0),
    setPreview: (doc) => {
      preview = doc;
    },
    redraw: (changed) => { redraw(changed); },
    refresh,
  });
  attachLabelInput({
    target: canvas,
    getView: () => view,
    getFile: () => session.file,
    measurer,
    getTool: () => tool,
    setPreview: (doc) => {
      preview = doc;
    },
    redraw: (changed) => { redraw(changed); },
    refresh,
  });
  attachReattachInput({
    target: canvas,
    getView: () => view,
    getFile: () => session.file,
    measurer,
    getTool: () => tool,
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
    getFile: () => session.file,
    measurer,
    getTool: () => tool,
    setEditing: (id) => {
      editing = id;
    },
    refresh,
  });
  attachEdgeInput({
    target: canvas,
    getView: () => view,
    getFile: () => session.file,
    measurer,
    getTool: () => tool,
    setTool,
    setDraft: (path) => {
      draft = path;
    },
    redrawOverlay: drawOverlay,
    refresh,
  });
  const placeHost = {
    target: canvas,
    getView: () => view,
    getFile: () => session.file,
    getTool: () => tool,
    setTool,
    getGrid: () => (grid.snap ? grid.size : 0),
    setDraft: (box: Box | null) => {
      shapeDraft = box;
    },
    redrawOverlay: drawOverlay,
    refresh,
  };
  attachPlaceInput({
    ...placeHost,
    tool: "shape",
    isArmed: () => armed !== null,
    place: (doc, from, to, snap) => newShapeCommand(doc, armed ?? { shape: "rect", size: { w: 160, h: 80 } }, from, to, snap),
  });
  attachPlaceInput({
    ...placeHost,
    tool: "frame",
    isArmed: () => true,
    place: newFrameCommand,
    placed: (id) => { textEdit.edit(id); },
  });
  attachPlaceInput({
    ...placeHost,
    tool: "text",
    isArmed: () => true,
    place: (doc, from) => ({ command: createTextCommand(doc, from), id: newTextId(doc) }),
    placed: (id) => { textEdit.edit(id); },
  });
  attachImageInput({
    target: canvas,
    getView: () => view,
    getFile: () => session.file,
    storage,
    showError,
    refresh,
  });
  attachViewInput({
    target: canvas,
    getView: () => view,
    setView,
    getTool: () => tool,
  });

  saveState.addEventListener("click", () => { void shell.save(); });
  undoButton.addEventListener("click", () => { if (session.file?.history.undo()) refresh(); });
  redoButton.addEventListener("click", () => { if (session.file?.history.redo()) refresh(); });
  for (const [which, button] of Object.entries(toolButtons)) {
    button.addEventListener("click", () => { setTool(which as Tool); });
  }
  const placeImage = async (source: File): Promise<void> => {
    const open = session.file;
    if (!open) return;
    const box = canvas.getBoundingClientRect();
    const at = screenToWorld(view, { x: box.width / 2, y: box.height / 2 });
    try {
      const made = await addImage({
        storage,
        diagramPath: open.path,
        doc: open.document,
        file: { name: source.name, type: source.type, bytes: new Uint8Array(await source.arrayBuffer()) },
        at,
        cap: { w: box.width / view.scale, h: box.height / view.scale },
        measure: measureInBrowser,
      });
      if (session.file !== open) return;
      open.history.execute(made.command, { selection: [made.id] });
      showError(null);
      setTool("select");
      refresh();
    } catch (error) {
      showError(error instanceof Error ? error.message : String(error));
    }
  };
  imageInput.addEventListener("change", () => {
    const chosen = imageInput.files?.[0];
    imageInput.value = "";
    if (chosen) void placeImage(chosen);
  });
  grip.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    grip.setPointerCapture(event.pointerId);
    const origin = { x: event.clientX, y: event.clientY, ox: toolbarOffset.x, oy: toolbarOffset.y };
    const onMove = (ev: PointerEvent): void => {
      if (ev.pointerId !== event.pointerId) return;
      toolbarOffset = { x: origin.ox + ev.clientX - origin.x, y: origin.oy + origin.y - ev.clientY };
      placeToolbar();
    };
    const onUp = (ev: PointerEvent): void => {
      if (ev.pointerId !== event.pointerId) return;
      grip.removeEventListener("pointermove", onMove);
      grip.removeEventListener("pointerup", onUp);
      const bounds = canvasWrap.getBoundingClientRect();
      const bar = toolbar.getBoundingClientRect();
      toolbarOffset = clampToolbar(toolbarOffset, { w: bounds.width, h: bounds.height }, { w: bar.width, h: bar.height });
      placeToolbar();
      saveToolbar();
    };
    grip.addEventListener("pointermove", onMove);
    grip.addEventListener("pointerup", onUp);
  });
  grip.addEventListener("dblclick", () => {
    toolbarOffset = { x: 0, y: 0 };
    placeToolbar();
    saveToolbar();
  });
  addEventListener("resize", () => { placeToolbar(); });
  gridToggle.addEventListener("change", () => { setGrid({ show: gridToggle.checked }); gridToggle.blur(); });
  snapToggle.addEventListener("change", () => { setGrid({ snap: snapToggle.checked }); snapToggle.blur(); });
  gridSize.addEventListener("change", () => { setGrid({ size: Number(gridSize.value) }); gridSize.blur(); });
  const zoomBy = (factor: number): void => {
    const box = canvas.getBoundingClientRect();
    setView(zoomAt(view, { x: box.width / 2, y: box.height / 2 }, factor));
  };
  const actions = editorActions({
    save: () => { void shell.save(); },
    undo: () => { if (session.file?.history.undo()) refresh(); },
    redo: () => { if (session.file?.history.redo()) refresh(); },
    toggleGrid: () => { setGrid({ show: !grid.show }); },
    toggleSnap: () => { setGrid({ snap: !grid.snap }); },
    zoomIn: () => { zoomBy(ZOOM_STEP); },
    zoomOut: () => { zoomBy(1 / ZOOM_STEP); },
    resetZoom: () => { zoomBy(1 / view.scale); },
    zoomToFit: () => { fit(); },
    setTool,
    canEdit: () => session.file !== null,
  });
  addEventListener("keydown", (event) => {
    dispatchKey(actions, event, isTextEntry(event.target));
  });
  addEventListener("beforeunload", (event) => {
    if (session.file?.dirty) event.preventDefault();
  });

  const button = (label: string, run: () => Promise<void>): HTMLButtonElement => {
    const item = el("button", { type: "button", textContent: label });
    item.addEventListener("click", () => { void run(); });
    return item;
  };
  const openLibraryFile = async (path: string): Promise<void> => {
    try {
      const slash = path.indexOf("/");
      if (session.info.kind === "library" && slash > 0) {
        await enterWorkspace(session, { project: path.slice(0, slash) });
        await shell.open(path.slice(slash + 1));
        return;
      }
      await shell.open(path);
    } catch (e) {
      showError(e instanceof Error ? e.message : String(e));
    }
  };
  const makeDraft = async (): Promise<void> => {
    try {
      showError(null);
      await openLibraryFile(await storage.createDraft());
    } catch (e) {
      showError(e instanceof Error ? e.message : String(e));
    }
  };
  const rememberConflict = (names: string[], value: string, error: unknown): void => {
    if (error instanceof StorageError && error.code === "conflict") names.push(value);
  };
  const makeProject = async (): Promise<void> => {
    const names = (await storage.listTop()).entries.filter((entry) => entry.type === "folder").map((entry) => entry.path);
    const name = await askName(root, "New project", (value) => projectNameCheck(value, names), async (value) => {
      try {
        await storage.createProject(value);
      } catch (error) {
        rememberConflict(names, value, error);
        throw error;
      }
    });
    if (name !== null) await fillListing("home");
  };
  const makeDiagram = async (): Promise<void> => {
    const files = (await storage.list()).map((file) => file.path);
    const place = session.info.path.slice(session.info.path.lastIndexOf("/") + 1);
    const where = place === "" ? "this folder" : place;
    const name = await askName(root, "New diagram", (value) => diagramNameCheck(value, files, where), async (value) => {
      try {
        if (session.info.kind === "project") await storage.createDiagram(where, value);
        else await writeText(storage, `${value}.drawit.kdl`, "diagram version=1\n");
      } catch (error) {
        rememberConflict(files, `${value}.drawit.kdl`, error);
        throw error;
      }
    });
    if (name !== null) await shell.open(`${name}.drawit.kdl`);
  };
  const way = (label: string, primary = false, run?: () => Promise<void>): HTMLButtonElement => {
    const item = el("button", { type: "button", className: primary ? "btn primary" : "btn", textContent: label });
    if (run) item.addEventListener("click", () => { void run(); });
    return item;
  };
  const folderName = (): string => session.info.path.slice(session.info.path.lastIndexOf("/") + 1);
  const diagramCount = (label: string): number => {
    const count = Number.parseInt(label, 10);
    return Number.isFinite(count) && count > 0 ? count : 0;
  };
  const applyRecent = async (edit: RecentEdit): Promise<void> => {
    const patch = reviseRecent(await readPrefs(), edit);
    if (Object.keys(patch).length > 0) await storage.patchPreferences(patch);
  };
  const confirmDelete = async (item: { kind: "project" | "diagram"; name: string; diagrams: number }, permanent: boolean): Promise<boolean> => {
    const text = deleteWording({ ...item, permanent });
    const answer = await openDialog(root, {
      title: text.title,
      body: text.body,
      choices: [{ label: "Cancel" }, { label: text.confirm, kind: "danger" }],
    });
    return answer === text.confirm;
  };
  const deleteLibraryItem = async (
    path: string,
    item: { kind: "project" | "diagram"; name: string; diagrams: number },
    edit: RecentEdit,
    which: "home" | "landing",
  ): Promise<void> => {
    if (!await confirmDelete(item, false)) return;
    try {
      try {
        await storage.deleteItem(path);
      } catch (error) {
        if (!(error instanceof StorageError) || error.code !== "conflict" || error.message !== "no trash") throw error;
        if (!await confirmDelete(item, true)) return;
        await storage.deleteItem(path, true);
      }
      await applyRecent(edit);
      showError(null);
      await fillListing(which);
    } catch (error) {
      showError(error instanceof Error ? error.message : String(error));
    }
  };
  const renameProject = async (card: ProjectCard): Promise<void> => {
    try {
      const names = (await storage.listTop()).entries.filter((entry) => entry.type === "folder" && entry.path !== card.name).map((entry) => entry.path);
      const name = await askName(root, "Rename project", (value) => projectNameCheck(value, names), async (value) => {
        if (value === card.name) return;
        try {
          const next = await storage.renameItem(card.name, value);
          await applyRecent({ type: "rename-project", library: session.info.path, from: card.name, to: next });
        } catch (error) {
          if (error instanceof StorageError && error.code === "conflict") names.push(value);
          throw error;
        }
      }, { confirm: "Rename", initial: card.name });
      if (name !== null) await fillListing("home");
    } catch (error) {
      showError(error instanceof Error ? error.message : String(error));
    }
  };
  const renameDiagram = async (card: LandingCard): Promise<void> => {
    const project = folderName();
    try {
      const files = (await storage.list()).map((file) => file.path).filter((path) => path !== card.path);
      const name = await askName(root, "Rename diagram", (value) => diagramNameCheck(value, files, project), async (value) => {
        if (value === card.name) return;
        try {
          const next = await storage.renameItem(`${project}/${card.path}`, value);
          const file = next.slice(next.lastIndexOf("/") + 1);
          await applyRecent({ type: "rename-file", folder: session.info.path, from: card.path, to: file });
        } catch (error) {
          if (error instanceof StorageError && error.code === "conflict") files.push(`${value}.drawit.kdl`);
          throw error;
        }
      }, { confirm: "Rename", initial: card.name, hint: (value) => `Saved as ${value}.drawit.kdl` });
      if (name !== null) await fillListing("landing");
    } catch (error) {
      showError(error instanceof Error ? error.message : String(error));
    }
  };
  // The open project lists its own files, so the library is opened only long enough to read the other project names.
  const otherProjects = async (): Promise<string[]> => {
    if (session.info.kind !== "project") return [];
    const project = folderName();
    endListing();
    let away = false;
    try {
      await enterWorkspace(session, { library: true });
      away = true;
      const names = (await storage.listTop()).entries.filter((entry) => entry.type === "folder").map((entry) => entry.path);
      await enterWorkspace(session, { project });
      away = false;
      return names.filter((name) => name !== project);
    } finally {
      if (away) {
        try {
          await enterWorkspace(session, { project });
        } catch (error) {
          showError(error instanceof Error ? error.message : String(error));
        }
      }
    }
  };
  const moveDiagram = async (card: LandingCard): Promise<void> => {
    const project = folderName();
    try {
      const destinations = await otherProjects();
      await askMove(
        root,
        card.name,
        destinations,
        [project, ...destinations],
        async (name) => { await storage.createProject(name); },
        async (dest) => { await moveToProject(storage, `${project}/${card.path}`, dest); },
      );
    } catch (error) {
      showError(error instanceof Error ? error.message : String(error));
    }
    if (session.file !== null) return;
    await fillListing(session.info.kind === "library" ? "home" : "landing");
  };
  let openMenu: { panel: HTMLElement; trigger: HTMLButtonElement; closer: () => void } | null = null;
  const closeMenu = (): void => {
    if (!openMenu) return;
    openMenu.closer();
    openMenu.panel.hidden = true;
    openMenu.trigger.setAttribute("aria-expanded", "false");
    openMenu = null;
  };
  const withMenu = (card: HTMLButtonElement, items: { label: string; danger?: boolean; run: () => void }[]): HTMLElement => {
    const trigger = el("button", { type: "button", className: "mnu", textContent: "⋯", ariaLabel: "Actions", ariaHasPopup: "menu", ariaExpanded: "false" });
    const panel = el("div", { className: "menu", role: "menu", hidden: true });
    panel.addEventListener("click", (event) => { event.stopPropagation(); });
    for (const item of items) {
      const row = el("button", { type: "button", role: "menuitem", textContent: item.label });
      if (item.danger) row.className = "danger";
      row.addEventListener("click", () => {
        closeMenu();
        item.run();
      });
      panel.append(row);
    }
    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      const already = openMenu?.trigger === trigger;
      closeMenu();
      if (already) return;
      panel.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      const onDoc = (): void => { closeMenu(); };
      const onKey = (keyEvent: KeyboardEvent): void => {
        if (keyEvent.key === "Escape") closeMenu();
      };
      const closer = (): void => {
        document.removeEventListener("click", onDoc);
        document.removeEventListener("keydown", onKey);
      };
      openMenu = { panel, trigger, closer };
      document.addEventListener("keydown", onKey);
      // The click that opened the menu must not close it.
      setTimeout(() => {
        if (openMenu?.trigger !== trigger) return;
        document.addEventListener("click", onDoc);
      }, 0);
    });
    return el("div", { className: "card-wrap" }, card, trigger, panel);
  };
  const fileIcon = (): SVGSVGElement => {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "file-icon");
    svg.setAttribute("viewBox", "0 0 18 18");
    svg.setAttribute("aria-hidden", "true");
    for (const d of ["M4 2h7l3 3v11H4z", "M11 2v3h3"]) {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", d);
      svg.append(path);
    }
    return svg;
  };
  const asThumb = (nodes: SvgNode[]): SvgNode[] => nodes.map((node) => {
    const id = node.attrs["data-id"];
    const attrs = typeof id === "string" ? { ...node.attrs, "data-id": `preview-${id}` } : node.attrs;
    return { ...node, attrs, children: asThumb(node.children) };
  });
  const previews = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      previews.unobserve(entry.target);
      const path = entry.target.getAttribute("data-preview");
      if (path !== null && entry.target instanceof HTMLElement) void showPreview(entry.target, path);
    }
  });
  const paintFace = (thumb: HTMLElement, face: CardFace): void => {
    thumb.classList.remove("load", "bad", "big");
    if (face.kind === "message") {
      thumb.classList.add(face.tone);
      if (face.title !== undefined) thumb.title = face.title;
      const note = el("span", { textContent: face.text });
      thumb.replaceChildren(...(face.tone === "load" ? [note] : [fileIcon(), note]));
      return;
    }
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "thumb");
    svg.setAttribute("viewBox", face.viewBox);
    const drawnDefs = document.createElementNS(SVG_NS, "defs");
    mount(drawnDefs, asThumb(face.defs));
    const drawn = document.createElementNS(SVG_NS, "g");
    mount(drawn, asThumb(face.nodes));
    svg.append(drawnDefs, drawn);
    thumb.replaceChildren(svg);
  };
  const showPreview = async (thumb: HTMLElement, path: string): Promise<void> => {
    const generation = listingGeneration;
    try {
      const info = await storage.stat(path);
      if (generation !== listingGeneration || !thumb.isConnected) return;
      paintFace(thumb, cardFace(await thumbs.picture(path, info.modified, info.size)));
    } catch {
      if (generation !== listingGeneration || !thumb.isConnected) return;
      paintFace(thumb, { kind: "message", tone: "bad", text: "Can't open this file" });
    }
  };
  const armPreview = (thumb: HTMLElement, path: string): void => {
    paintFace(thumb, cardFace(null));
    thumb.setAttribute("data-preview", path);
    previews.observe(thumb);
  };
  const projectCard = (card: ProjectCard): HTMLElement => {
    const thumb = el("span", { className: "th" }, fileIcon());
    if (card.latest) thumb.title = card.latest;
    if (card.preview) armPreview(thumb, card.preview);
    const item = el(
      "button",
      { type: "button", className: "card", ariaLabel: card.name },
      thumb,
      el("span", { className: "name" }, card.name),
      el("span", { className: "meta" }, `${card.diagrams} · ${card.when}`),
    );
    item.addEventListener("click", () => { void openFolder(card.name); });
    return withMenu(item, [
      { label: "Rename", run: () => { void renameProject(card); } },
      { label: "Delete", danger: true, run: () => { void deleteLibraryItem(card.name, { kind: "project", name: card.name, diagrams: diagramCount(card.diagrams) }, { type: "delete-project", library: session.info.path, project: card.name }, "home"); } },
    ]);
  };
  const previewThumb = (path: string): HTMLElement => {
    const thumb = el("span", { className: "th" });
    armPreview(thumb, path);
    return thumb;
  };
  const recentCard = (card: RecentCard): HTMLButtonElement => {
    const item = el(
      "button",
      { type: "button", className: "card", ariaLabel: card.name },
      previewThumb(card.path),
      el("span", { className: "name" }, card.name),
      el("span", { className: "meta" }, card.project),
    );
    item.addEventListener("click", () => { void openLibraryFile(card.path); });
    return item;
  };
  const diagramCard = (card: LandingCard, menu: boolean): HTMLElement => {
    const item = el(
      "button",
      { type: "button", className: "card", ariaLabel: card.name },
      previewThumb(card.path),
      el("span", { className: "name" }, card.name),
      el("span", { className: "meta" }, card.when),
    );
    item.addEventListener("click", () => { void shell.open(card.path); });
    if (!menu) return item;
    return withMenu(item, [
      { label: "Rename", run: () => { void renameDiagram(card); } },
      { label: "Move to project…", run: () => { void moveDiagram(card); } },
      { label: "Delete", danger: true, run: () => { void deleteLibraryItem(`${folderName()}/${card.path}`, { kind: "diagram", name: card.name, diagrams: 0 }, { type: "delete-file", folder: session.info.path, file: card.path }, "landing"); } },
    ]);
  };
  const emptyFolder = "No .drawit.kdl files in this folder.";
  const paintLanding = (files: readonly FileInfo[], preferences: Preferences): void => {
    closeMenu();
    const model = landingModel(files, preferences, session.info, new Date());
    listing.setAttribute("aria-label", model.title);
    if (model.diagrams.length === 0) showError(emptyFolder);
    else if (error.textContent === emptyFolder) showError(null);
    const back = button("‹ Home", () => leaveToHome());
    back.className = "back";
    const head = el("div", { className: "head folder" }, back, el("h2", { textContent: model.title }));
    if (model.tag !== "") head.append(el("span", { className: "tag", textContent: model.tag }));
    if (model.folderPath !== "") head.append(el("span", { className: "path", textContent: model.folderPath }));
    head.append(way("New diagram", true, makeDiagram));
    const add = way("+ New diagram", false, makeDiagram);
    add.className = "card add";
    const menu = session.info.kind === "project";
    const blocks: Node[] = [head, el("div", { className: "cards" }, ...model.diagrams.map((card) => diagramCard(card, menu)), add)];
    if (model.recent.length > 0) {
      blocks.push(el("h3", { className: "sec", textContent: model.recentTitle }), el("div", { className: "cards" }, ...model.recent.map((card) => diagramCard(card, false))));
    }
    listing.replaceChildren(...blocks);
  };
  const fileOpen = (): boolean => session.file !== null;
  const followListing = (files: readonly FileInfo[], generation: number): void => {
    stopListing = watchListing(
      () => storage.list(),
      async (next) => {
        if (generation !== listingGeneration || fileOpen()) return;
        const preferences = await readPrefs();
        if (generation !== listingGeneration || fileOpen()) return;
        paintLanding(next, preferences);
      },
      { signature: listingSignature(files), visible: () => document.visibilityState !== "hidden" },
    );
  };
  const fillListing = async (which: "home" | "landing"): Promise<void> => {
    closeMenu();
    endListing();
    const generation = listingGeneration;
    showBoard(which);
    if (which === "home") {
      const top = await session.storage.listTop();
      const model = homeModel(top.entries, await readPrefs(), session.info.path, new Date());
      if (generation !== listingGeneration) return;
      showError(null);
      if (model.kind === "first-run") {
        listing.replaceChildren(el(
          "div",
          { className: "first-run" },
          el("h2", { textContent: "Draw your first diagram" }),
          el("p", {}, "Your projects are saved in ", el("b", { textContent: "~/DrawIt" }), " as plain text files."),
          el("div", { className: "acts" }, way("New diagram", true, makeDraft), way("New project", false, makeProject), way("Open folder…", false, browseFor), way("Import a file", false, bringFile)),
        ));
        return;
      }
      const add = way("+ New project", false, makeProject);
      add.className = "card add";
      const blocks: Node[] = [
        el("div", { className: "head" }, el("h2", { textContent: "Projects" }), way("New diagram", false, makeDraft), way("New project", true, makeProject)),
        el("div", { className: "cards" }, ...model.projects.map(projectCard), add),
      ];
      if (model.recent.length > 0) {
        blocks.push(el("h3", { className: "sec", textContent: "Recent" }), el("div", { className: "cards" }, ...model.recent.map(recentCard)));
      }
      listing.replaceChildren(...blocks);
      return;
    }
    const files = await storage.list();
    if (generation !== listingGeneration) return;
    paintLanding(files, await readPrefs());
    if (generation !== listingGeneration) return;
    followListing(files, generation);
  };
  const leaveToHome = async (): Promise<void> => {
    try {
      await enterWorkspace(session, { library: true });
      showError(null);
      await fillListing("home");
    } catch (e) {
      showError(e instanceof Error ? e.message : String(e));
    }
  };
  const openFolder = async (name: string): Promise<void> => {
    try {
      if (session.info.kind === "library") await enterWorkspace(session, { project: name });
      else if (session.info.path.startsWith("/")) await enterWorkspace(session, { folder: `${session.info.path}/${name}` });
      else {
        showError("That folder cannot be opened from here.");
        return;
      }
      showError(null);
      await fillListing("landing");
    } catch (e) {
      showError(e instanceof Error ? e.message : String(e));
    }
  };
  const closeToLanding = async (): Promise<void> => {
    if (session.file?.dirty && !confirm(`Discard unsaved changes to ${session.file.path}?`)) return;
    textEdit.close();
    stopWatch();
    stopWatch = () => {};
    session.file = null;
    preview = null;
    refresh();
    await fillListing("landing");
  };
  const bringFile = async (): Promise<void> => {
    try {
      const projects = (await storage.listTop()).entries.filter((entry) => entry.type === "folder").map((entry) => entry.path);
      const done = await askImport(root, projects, async (project, name, data) => {
        await storage.importFiles(project, [{ path: name, data }]);
      });
      if (!done) return;
      showError(null);
      await fillListing("home");
    } catch (error) {
      showError(error instanceof Error ? error.message : String(error));
    }
  };
  const browseFor = async (): Promise<void> => {
    try {
      const picked = await askBrowse(
        root,
        (path) => storage.browse(path),
        (path, name) => storage.createFolder(path, name),
      );
      if (picked === null) return;
      if (picked.kind === "folder") {
        await enterWorkspace(session, { folder: picked.path });
        showError(null);
        await fillListing("landing");
        return;
      }
      const file = picked.path.slice(picked.path.lastIndexOf("/") + 1);
      await enterWorkspace(session, { file: picked.path });
      await shell.open(file);
      if (session.file === null) await fillListing("landing");
    } catch (error) {
      showError(error instanceof Error ? error.message : String(error));
    }
  };
  importButton.addEventListener("click", () => { void bringFile(); });
  folderButton.addEventListener("click", () => { void browseFor(); });
  pillHome.addEventListener("click", () => { void closeToLanding(); });

  const storedToolbar = readToolbar((await readPrefs())["toolbar"]);
  toolbarOffset = { x: storedToolbar.x, y: storedToolbar.y };
  toolbarShown = storedToolbar.shown;
  placeToolbar();
  session.info = await storage.currentWorkspace();
  if (screen === "file") {
    const paths = await workspaceFiles(storage);
    if (paths.length === 0) showError("No .drawit.kdl files in this folder.");
    else await shell.open(paths[0] ?? "");
  } else await fillListing(screen);
  return shell;
}
