// The app's DOM, built by hand (no UI framework). One toolbar, an error banner and the canvas.
// All state lives in the open `OpenFile`; the DOM is redrawn from it.
import { attachEdgeInput } from "../connectors/input.ts";
import { attachBendInput } from "../connectors/bend-input.ts";
import { attachLabelInput } from "../connectors/label-input.ts";
import { attachReattachInput } from "../connectors/reattach-input.ts";
import { openExportDialog } from "../export/dialog.ts";
import { attachEditInput } from "../edit/input.ts";
import { dispatchKey, editorActions } from "./actions.ts";
import { installKeyGuard, openDialog, openNotice } from "./dialog.ts";
import { CanvasPointer } from "./pointer.ts";
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
import { diagramBounds } from "../render/bounds.ts";
import { describeDiagram, type SvgNode } from "../render/describe.ts";
import { describeGrid } from "../render/grid.ts";
import { attachClipboard } from "../clipboard/events.ts";
import { ClipboardImages } from "../clipboard/images.ts";
import { addImage, measureInBrowser } from "../images/add.ts";
import { attachImageInput, placeImageFiles } from "../images/input.ts";
import { decodeInBrowser, ImageStore } from "../images/store.ts";
import { useImages } from "../render/images.ts";
import { mount, patch } from "../render/mount.ts";
import { describeOverlay } from "../render/overlay.ts";
import { attachTransformInput } from "../move/input.ts";
import { attachSelectInput } from "../select/input.ts";
import { type FileInfo, type Preferences, type StorageAdapter, StorageError, writeText } from "../storage/adapter.ts";
import { bundledLoader } from "../shapes/bundled-packs.ts";
import type { ColourStore } from "../style/colours.ts";
import { createStylePanel } from "../style/panel.ts";
import { loadFonts } from "../text/fonts.ts";
import { attachTextEdit, type TextEdit } from "../text/edit.ts";
import { createTextMeasurer } from "../text/measure.ts";
import { createTextCommand, newTextId } from "../text/target.ts";
import { attachViewInput, ZOOM_STEP } from "../view/input.ts";
import { documentBounds, IDENTITY, screenToWorld, type View, viewTransform, zoomAt, zoomToBounds, zoomToFit } from "../view/view.ts";
import { GRID_SIZES, readGrid, statusFit, type GridSettings } from "./status.ts";
import { autosaveOn, createAutosave } from "./autosave.ts";
import { replaceFromDisk, watchChanges } from "./changes.ts";
import { cardFace, ThumbnailCache, type CardFace } from "./thumbnail.ts";
import type { Tool } from "./tool.ts";
import { dragPanel, fitPanels, LIBRARY_WIDTH, PROPERTIES_WIDTH, readPanels, type PanelWidths } from "./panels.ts";
import { clampToolbar, readToolbar, TOOLBAR_BOTTOM } from "./toolbar.ts";
import { askMove, askName } from "./create.ts";
import { askBrowse, askImport } from "./pick.ts";
import { homeModel, type ProjectCard, type RecentCard } from "./home.ts";
import { landingModel, listingSignature, recordOpened, reviseRecent, watchListing, type LandingCard, type RecentEdit } from "./landing.ts";
import { moveToProject } from "./move.ts";
import { diagramNameCheck, projectNameCheck } from "./names.ts";
import { deleteWording } from "./remove.ts";
import { enterWorkspace, type EditorSession } from "./session.ts";
import { FILE_EXTENSION, FileChanged, type OpenFile, openFile, workspaceFiles } from "./workspace.ts";

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

export type { GridSettings } from "./status.ts";

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
  const saveState = el("button", { type: "button", className: "save", textContent: "Saved", disabled: true });
  const exportButton = el("button", { type: "button", className: "export", textContent: "Export", disabled: true });
  const pillHome = el("button", { type: "button", textContent: "Home" });
  const filePill = el("div", { className: "pill" }, pillHome, fileName, undoButton, redoButton, saveState, exportButton);
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
  const zoomOut = el("button", { type: "button", textContent: "−", ariaLabel: "Zoom out" });
  const zoomIn = el("button", { type: "button", textContent: "+", ariaLabel: "Zoom in" });
  const cursor = el("span", { className: "cursor" });
  const gridToggle = el("input", { type: "checkbox" });
  const snapToggle = el("input", { type: "checkbox" });
  const gridSize = el("select", { ariaLabel: "Grid size" }, ...GRID_SIZES.map((n) => el("option", { value: String(n), textContent: String(n) })));
  const status = el(
    "div",
    { className: "pill status", hidden: screen !== "file" },
    zoomOut,
    zoom,
    zoomIn,
    cursor,
    el("label", {}, gridToggle, "Grid"),
    el("label", {}, snapToggle, "Snap"),
    el("label", {}, "Grid size", gridSize),
  );
  const colours: ColourStore = {
    load: () => {
      const stored = preferenceFile["colours"];
      if (typeof stored !== "object" || stored === null) return [];
      const recent = (stored as Record<string, unknown>)["recent"];
      return Array.isArray(recent) ? recent.filter((item): item is string => typeof item === "string") : [];
    },
    save: (list) => {
      const stored = preferenceFile["colours"];
      const base = typeof stored === "object" && stored !== null ? stored as Record<string, unknown> : {};
      preferenceFile = { ...preferenceFile, colours: { ...base, recent: [...list] } };
      void storage.patchPreferences({ colours: { recent: [...list] } });
    },
  };
  const stylePanel = createStylePanel({ getFile: () => session.file, measurer, refresh: () => { refresh(); }, colours });
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
  const canvasWrap = el("div", { className: "stage" }, canvas, filePill, status, toolbar, imageInput);
  const libraryEdge = el("div", { className: "resizer", role: "separator", ariaLabel: "Library width" });
  const propertiesEdge = el("div", { className: "resizer", role: "separator", ariaLabel: "Properties width" });
  const stage = el("div", { className: "workspace", hidden: screen !== "file" }, library.element, canvasWrap, stylePanel.element, libraryEdge, propertiesEdge);
  root.replaceChildren(
    el("header", { className: "bar" }, el("h1", { textContent: "DrawIt" }), boardNav),
    error,
    listing,
    stage,
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

  let saving = false;
  let seenVersion = -1;
  let preferenceFile: Preferences = {};
  const autosave = createAutosave({
    enabled: () => autosaveOn(preferenceFile, session.info.kind),
    dirty: () => session.file?.dirty === true,
    save: async () => {
      const file = session.file;
      if (!file) return;
      saving = true;
      refresh();
      try {
        await file.save(storage);
        if (session.file === file) showError(null);
      } catch (e) {
        if (e instanceof FileChanged) {
          if (session.file === file) void askConflict(file, e.text);
        } else if (session.file === file) {
          showError(`${file.path} was not saved: ${e instanceof Error ? e.message : String(e)}`);
        }
      } finally {
        saving = false;
        if (session.file === file) refresh();
      }
    },
  });
  const refresh = (changed?: ReadonlySet<string>): void => {
    redraw(changed);
    fileName.textContent = session.file?.path ?? "";
    const dirty = session.file?.dirty === true;
    const writing = session.file !== null && saving;
    saveState.textContent = writing ? "Saving" : dirty ? "Not saved" : "Saved";
    saveState.classList.toggle("dirty", !writing && dirty);
    saveState.disabled = session.file === null;
    exportButton.disabled = session.file === null;
    undoButton.disabled = session.file?.history.canUndo !== true;
    redoButton.disabled = session.file?.history.canRedo !== true;
    stylePanel.update();
    propertiesEdge.hidden = stylePanel.element.hidden;
    const version = session.file?.history.version;
    if (session.file && version !== undefined && version !== seenVersion) {
      seenVersion = version;
      autosave.edited();
    }
  };

  const diagramName = (path: string): string => {
    const base = path.slice(path.lastIndexOf("/") + 1);
    return base.endsWith(FILE_EXTENSION) ? base.slice(0, -FILE_EXTENSION.length) : base;
  };
  let conflict: Promise<void> | null = null;
  const askConflict = (file: OpenFile, text: string): Promise<void> => {
    if (conflict) return conflict;
    const name = file.path.slice(file.path.lastIndexOf("/") + 1);
    conflict = openNotice(root, {
      lead: `${name} changed on disk.`,
      body: "Keep your edits and overwrite it, or reload and lose your edits.",
      choices: [
        { label: "Reload" },
        { label: "Keep my edits", kind: "primary" },
      ],
    }).then(async (answer) => {
      if (session.file !== file) return;
      if (answer === "Keep my edits") {
        try {
          await file.save(storage, "overwrite");
          showError(null);
        } catch (e) {
          showError(`${file.path} was not saved: ${e instanceof Error ? e.message : String(e)}`);
        }
        refresh();
        return;
      }
      if (answer !== "Reload") return;
      const reason = replaceFromDisk(file, text, measurer);
      if (reason !== null) {
        showError(`${file.path} was not reloaded: ${reason}`);
        return;
      }
      showError(null);
      refresh();
    }).finally(() => {
      conflict = null;
    });
    return conflict;
  };
  const confirmLeave = async (): Promise<boolean> => {
    const file = session.file;
    if (!file?.dirty) return true;
    autosave.stop();
    const answer = await openDialog(root, {
      title: `Save changes to "${diagramName(file.path)}"?`,
      body: "Your edits since the last save are lost if you discard them.",
      aside: { label: "Discard", kind: "danger" },
      choices: [{ label: "Cancel" }, { label: "Save", kind: "primary" }],
    });
    if (answer === "Discard") return true;
    if (answer !== "Save") {
      autosave.edited();
      return false;
    }
    try {
      await file.save(storage);
    } catch (e) {
      if (e instanceof FileChanged) void askConflict(file, e.text);
      else showError(`${file.path} was not saved: ${e instanceof Error ? e.message : String(e)}`);
      refresh();
      autosave.edited();
      return false;
    }
    showError(null);
    refresh();
    return true;
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

  let panels: PanelWidths = readPanels(undefined);
  const placePanels = (): void => {
    const width = stage.clientWidth;
    if (width === 0) return;
    const fitted = fitPanels(panels.library, panels.properties, width);
    library.element.style.width = `${String(fitted.library)}px`;
    stylePanel.element.style.width = `${String(fitted.properties)}px`;
    libraryEdge.style.left = `${String(fitted.library - 3)}px`;
    propertiesEdge.style.left = `${String(width - fitted.properties - 3)}px`;
    propertiesEdge.hidden = stylePanel.element.hidden;
  };
  const savePanels = (): void => {
    preferenceFile = {
      ...preferenceFile,
      panels: {
        library: panels.library,
        properties: panels.properties,
        libraryShown: panels.libraryShown,
        propertiesShown: panels.propertiesShown,
      },
    };
    void storage.patchPreferences({
      panels: {
        library: panels.library,
        properties: panels.properties,
        libraryShown: panels.libraryShown,
        propertiesShown: panels.propertiesShown,
      },
    });
  };
  const dragEdge = (edge: HTMLElement, side: "library" | "properties"): void => {
    edge.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      edge.setPointerCapture(event.pointerId);
      edge.classList.add("on");
      const origin = event.clientX;
      const target = side === "library" ? library.element : stylePanel.element;
      const fitted = fitPanels(panels.library, panels.properties, stage.clientWidth);
      const start = side === "library" ? fitted.library : fitted.properties;
      const other = side === "library" ? fitted.properties : fitted.library;
      let next = start;
      const onMove = (ev: PointerEvent): void => {
        if (ev.pointerId !== event.pointerId) return;
        const delta = ev.clientX - origin;
        next = dragPanel(side === "library" ? start + delta : start - delta, other, stage.clientWidth);
        target.style.width = `${String(next)}px`;
        if (side === "library") libraryEdge.style.left = `${String(next - 3)}px`;
        else propertiesEdge.style.left = `${String(stage.clientWidth - next - 3)}px`;
      };
      const onUp = (ev: PointerEvent): void => {
        if (ev.pointerId !== event.pointerId) return;
        edge.removeEventListener("pointermove", onMove);
        edge.removeEventListener("pointerup", onUp);
        edge.classList.remove("on");
        if (ev.clientX === origin) return;
        panels = { ...panels, [side]: next };
        placePanels();
        savePanels();
      };
      edge.addEventListener("pointermove", onMove);
      edge.addEventListener("pointerup", onUp);
    });
    edge.addEventListener("dblclick", () => {
      panels = { ...panels, [side]: side === "library" ? LIBRARY_WIDTH : PROPERTIES_WIDTH };
      placePanels();
      savePanels();
    });
  };
  dragEdge(libraryEdge, "library");
  dragEdge(propertiesEdge, "properties");

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
  const placeStatus = (): void => {
    if (stage.hidden) {
      status.hidden = true;
      return;
    }
    cursor.hidden = false;
    status.hidden = false;
    const full = status.offsetWidth;
    cursor.hidden = true;
    const fit = statusFit(canvasWrap.clientWidth, full, status.offsetWidth, filePill.offsetWidth);
    status.hidden = fit === "hidden";
    cursor.hidden = fit !== "full";
  };
  let gridReady = false;
  const setGrid = (change: Partial<GridSettings>): void => {
    grid = { ...grid, ...change };
    gridToggle.checked = grid.show;
    snapToggle.checked = grid.snap;
    gridSize.value = String(grid.size);
    drawGrid();
    if (gridReady) void storage.patchPreferences({ grid: { show: grid.show, snap: grid.snap, size: grid.size } });
    placeStatus();
  };

  const setView = (next: View): void => {
    view = next;
    world.setAttribute("transform", viewTransform(view));
    zoom.textContent = `${String(Math.round(view.scale * 100))}%`;
    drawGrid();
    placeStatus();
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
    placePanels();
    placeStatus();
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
      preferenceFile = await storage.readPreferences();
      return preferenceFile;
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
      onConflict: (text) => {
        void askConflict(file, text);
      },
    });
  };
  const doOpen = async (path: string): Promise<void> => {
    if (!(await confirmLeave())) return;
    const held = session.file;
    if (held) autosave.stop();
    textEdit?.close();
    try {
      const result = await openFile(storage, path, measurer);
      if (result.ok) {
        endListing();
        session.file = result.file;
        seenVersion = result.file.history.version;
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
        if (held) autosave.edited();
      }
    } catch (e) {
      showError(`${path} was not opened: ${e instanceof StorageError ? e.message : String(e)}`);
      if (session.file === held && held) autosave.edited();
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
      await autosave.saveNow();
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
  const imageHost = {
    target: canvas,
    getView: () => view,
    getFile: () => session.file,
    storage,
    showError,
    refresh,
  };
  attachImageInput(imageHost);
  const pointer = new CanvasPointer();
  attachClipboard({
    getFile: () => session.file,
    storage,
    measurer,
    images: new ClipboardImages(),
    pointer: () => pointer.at,
    imageFallback: () => {
      const box = canvas.getBoundingClientRect();
      return screenToWorld(view, { x: box.width / 2, y: box.height / 2 });
    },
    placeImages: (files, at) => placeImageFiles(imageHost, files, at),
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
  addEventListener("resize", () => { placeToolbar(); placePanels(); placeStatus(); });
  canvas.addEventListener("pointermove", (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.move(screenToWorld(view, { x: event.clientX - rect.left, y: event.clientY - rect.top }));
    const at = pointer.at;
    if (at) cursor.textContent = `${String(Math.round(at.x))}, ${String(Math.round(at.y))}`;
  });
  canvas.addEventListener("pointerleave", () => { pointer.leave(); });
  zoomOut.addEventListener("click", () => { zoomBy(1 / ZOOM_STEP); });
  zoomIn.addEventListener("click", () => { zoomBy(ZOOM_STEP); });
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
    zoomToSelection: () => {
      const file = session.file;
      if (!file || file.history.selection.length === 0) return;
      const box = canvas.getBoundingClientRect();
      const next = zoomToBounds(
        diagramBounds(file.document, measurer, images.lookup, new Set(file.history.selection)),
        { w: box.width, h: box.height },
        48,
      );
      if (next) setView(next);
    },
    setTool,
    canEdit: () => session.file !== null,
  });
  addEventListener("keydown", (event) => {
    dispatchKey(actions, event, isTextEntry(event.target));
  });
  addEventListener("beforeunload", (event) => {
    if (!session.file?.dirty) return;
    event.preventDefault();
  });

  const button = (label: string, run: () => Promise<void>): HTMLButtonElement => {
    const item = el("button", { type: "button", textContent: label });
    item.addEventListener("click", () => { void run(); });
    return item;
  };
  const dropOpenFile = (): void => {
    autosave.stop();
    textEdit.close();
    stopWatch();
    stopWatch = () => {};
    session.file = null;
    seenVersion = -1;
    preview = null;
    refresh();
  };
  const openLibraryFile = async (path: string): Promise<void> => {
    try {
      const slash = path.indexOf("/");
      if (session.info.kind === "library" && slash > 0) {
        if (!(await confirmLeave())) return;
        await enterWorkspace(session, { project: path.slice(0, slash) });
        if (session.file) dropOpenFile();
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
    if (!(await confirmLeave())) return;
    try {
      await enterWorkspace(session, { library: true });
      if (session.file) dropOpenFile();
      showError(null);
      await fillListing("home");
    } catch (e) {
      showError(e instanceof Error ? e.message : String(e));
    }
  };
  const openFolder = async (name: string): Promise<void> => {
    if (session.info.kind !== "library" && !session.info.path.startsWith("/")) {
      showError("That folder cannot be opened from here.");
      return;
    }
    if (!(await confirmLeave())) return;
    try {
      if (session.info.kind === "library") await enterWorkspace(session, { project: name });
      else await enterWorkspace(session, { folder: `${session.info.path}/${name}` });
      if (session.file) dropOpenFile();
      showError(null);
      await fillListing("landing");
    } catch (e) {
      showError(e instanceof Error ? e.message : String(e));
    }
  };
  const closeToLanding = async (): Promise<void> => {
    if (!(await confirmLeave())) return;
    dropOpenFile();
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
      if (!(await confirmLeave())) return;
      if (picked.kind === "folder") {
        await enterWorkspace(session, { folder: picked.path });
        if (session.file) dropOpenFile();
        showError(null);
        await fillListing("landing");
        return;
      }
      const file = picked.path.slice(picked.path.lastIndexOf("/") + 1);
      await enterWorkspace(session, { file: picked.path });
      if (session.file) dropOpenFile();
      await shell.open(file);
      if (session.file === null) await fillListing("landing");
    } catch (error) {
      showError(error instanceof Error ? error.message : String(error));
    }
  };
  importButton.addEventListener("click", () => { void bringFile(); });
  folderButton.addEventListener("click", () => { void browseFor(); });
  pillHome.addEventListener("click", () => { void closeToLanding(); });
  exportButton.addEventListener("click", () => {
    const file = session.file;
    if (!file) return;
    void openExportDialog(root, {
      doc: file.document,
      measurer,
      diagramPath: file.path,
      images: images.lookup,
      storage,
      selection: [...file.history.selection],
    });
  });

  const stored = await readPrefs();
  const storedToolbar = readToolbar(stored["toolbar"]);
  toolbarOffset = { x: storedToolbar.x, y: storedToolbar.y };
  toolbarShown = storedToolbar.shown;
  placeToolbar();
  panels = readPanels(stored["panels"]);
  placePanels();
  setGrid(readGrid(stored["grid"]));
  gridReady = true;
  placeStatus();
  session.info = await storage.currentWorkspace();
  if (screen === "file") {
    const paths = await workspaceFiles(storage);
    if (paths.length === 0) showError("No .drawit.kdl files in this folder.");
    else await shell.open(paths[0] ?? "");
  } else await fillListing(screen);
  return shell;
}
