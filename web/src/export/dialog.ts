import { openDialog } from "../app/dialog.ts";
import type { DiagramDocument } from "../model/index.ts";
import type { ImageLookup } from "../render/images.ts";
import type { StorageAdapter } from "../storage/adapter.ts";
import type { TextMeasurer } from "../text/measure.ts";
import { buildExport, type BuiltExport } from "./build.ts";
import type { PngScale } from "./png.ts";

export interface ExportDialogInput {
  doc: DiagramDocument;
  measurer: TextMeasurer;
  diagramPath: string;
  images: ImageLookup;
  storage: StorageAdapter;
  selection: readonly string[];
}

interface Choice {
  scope: "canvas" | "selection" | "frame";
  frameId: string;
  format: "svg" | "png";
  scale: PngScale;
  transparent: boolean;
}

/** Reads a bundled font file. Same-origin, so the page policy allows it. */
export function readFontFile(url: string): Promise<Uint8Array> {
  return fetch(url).then(async (response) => {
    if (!response.ok) throw new Error("missing font");
    return new Uint8Array(await response.arrayBuffer());
  });
}

/** Saves a blob with the browser's own download. A blob URL is allowed for the image, and the download uses one too. */
export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => { URL.revokeObjectURL(url); }, 10_000);
}

function button(label: string, pressed: boolean): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.setAttribute("aria-pressed", String(pressed));
  return element;
}

function radio(group: string, value: string, label: string, checked: boolean): HTMLLabelElement {
  const input = document.createElement("input");
  input.type = "radio";
  input.name = group;
  input.value = value;
  input.checked = checked;
  const row = document.createElement("label");
  row.append(input, document.createTextNode(` ${label}`));
  return row;
}

export function openExportDialog(parent: HTMLElement, input: ExportDialogInput): Promise<void> {
  const frames = input.doc.elements.flatMap((element) => element.kind === "frame" ? [{ id: element.id, name: element.name ?? element.id }] : []);
  const choice: Choice = {
    scope: "canvas",
    frameId: frames[0]?.id ?? "",
    format: "png",
    scale: 1,
    transparent: true,
  };
  let current: BuiltExport | null = null;
  let previewUrl = "";
  let token = 0;
  let download: HTMLButtonElement | null = null;
  let note: HTMLElement | null = null;

  const summary = document.createElement("div");
  summary.className = "muted";
  const error = document.createElement("div");
  error.className = "err";
  const preview = document.createElement("img");
  preview.alt = "Preview";
  const picture = document.createElement("div");
  picture.className = "pv";
  picture.append(preview);

  const scopeBox = document.createElement("div");
  const formatBar = document.createElement("div");
  formatBar.className = "seg";
  const scaleBar = document.createElement("div");
  scaleBar.className = "seg";
  const transparent = document.createElement("input");
  transparent.type = "checkbox";
  transparent.checked = choice.transparent;
  transparent.id = "export-transparent";

  const show = (): void => {
    const mine = ++token;
    const pending = buildExport({
      doc: input.doc,
      measurer: input.measurer,
      diagramPath: input.diagramPath,
      images: input.images,
      storage: input.storage,
      readFont: readFontFile,
      selection: input.selection,
      scope: choice.scope,
      ...(choice.scope === "frame" && { frameId: choice.frameId }),
      format: choice.format,
      scale: choice.scale,
      transparent: choice.transparent,
    });
    void pending.then((built) => {
      if (mine !== token) return;
      current = built;
      summary.textContent = built.summary;
      error.textContent = built.message;
      if (note) note.textContent = built.message ? "" : built.name;
      if (download) download.disabled = built.blob === null;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = "";
      if (built.blob) {
        previewUrl = URL.createObjectURL(built.blob);
        preview.src = previewUrl;
      } else {
        preview.removeAttribute("src");
      }
    });
  };

  const paintFormats = (): void => {
    formatBar.replaceChildren();
    for (const format of ["SVG", "PNG"] as const) {
      const pressed = (format === "SVG" ? "svg" : "png") === choice.format;
      const element = button(format, pressed);
      element.addEventListener("click", () => {
        choice.format = format === "SVG" ? "svg" : "png";
        paintFormats();
        paintScales();
        show();
      });
      formatBar.append(element);
    }
    const png = choice.format === "png";
    for (const element of scaleBar.querySelectorAll("button")) element.disabled = !png;
    transparent.disabled = !png;
  };

  const paintScales = (): void => {
    scaleBar.replaceChildren();
    for (const scale of [1, 2, 3] as const) {
      const element = button(`${String(scale)}x`, choice.scale === scale);
      element.disabled = choice.format !== "png";
      element.addEventListener("click", () => {
        choice.scale = scale;
        paintScales();
        show();
      });
      scaleBar.append(element);
    }
  };

  scopeBox.append(radio("export-scope", "canvas", "Whole canvas", true));
  scopeBox.append(radio("export-scope", "selection", "Selection", false));
  for (const frame of frames) scopeBox.append(radio("export-scope", frame.id, `Frame: ${frame.name}`, false));
  scopeBox.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.value === "canvas" || target.value === "selection") choice.scope = target.value;
    else {
      choice.scope = "frame";
      choice.frameId = target.value;
    }
    show();
  });
  transparent.addEventListener("change", () => {
    choice.transparent = transparent.checked;
    show();
  });
  paintFormats();
  paintScales();

  const heading = (text: string): HTMLDivElement => {
    const element = document.createElement("div");
    element.className = "muted";
    element.textContent = text;
    return element;
  };
  const transparentRow = document.createElement("label");
  transparentRow.append(transparent, document.createTextNode(" Transparent background"));
  const options = document.createElement("div");
  options.className = "opts";
  options.append(heading("What"), scopeBox, heading("Format"), formatBar, heading("Scale"), scaleBar, transparentRow);
  const side = document.createElement("div");
  side.className = "side";
  side.append(picture, summary, error);
  const body = document.createElement("div");
  body.className = "export";
  body.append(options, side);
  show();

  return openDialog(parent, {
    title: "Export",
    body,
    choices: [
      { label: "Cancel" },
      {
        label: "Download",
        kind: "primary",
        commit: () => {
          const built = current;
          if (!built?.blob) return Promise.resolve(false);
          saveBlob(built.blob, built.name);
          return Promise.resolve(true);
        },
      },
    ],
    prepare: (sheet) => {
      sheet.classList.add("export-sheet");
      download = [...sheet.querySelectorAll("button")].find((element) => element.textContent === "Download") ?? null;
      if (download) download.disabled = current?.blob == null;
      const foot = sheet.querySelector(".ft");
      note = document.createElement("span");
      note.className = "file-name";
      note.textContent = current && !current.message ? current.name : "";
      foot?.prepend(note);
    },
  }).then(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  });
}
