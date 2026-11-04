// Dropping image files on the canvas and pasting them. Each file is saved in `assets/` and added as
// its own undoable command; a message is shown for a file that cannot be added.
import type { OpenFile } from "../app/workspace.ts";
import { isTextEntry } from "../app/text-entry.ts";
import type { Point } from "../model/index.ts";
import type { StorageAdapter } from "../storage/adapter.ts";
import { screenToWorld, type View } from "../view/view.ts";
import { addImage, type ImageFile, measureInBrowser } from "./add.ts";

/** How far each further file of one drop or paste is moved from the last, so they do not hide each other. */
const STEP = 24;

export interface ImageInputHost {
  target: SVGSVGElement;
  getView(): View;
  getFile(): OpenFile | null;
  storage: StorageAdapter;
  /** Shows a message, or clears it with null. */
  showError(message: string | null): void;
  refresh(): void;
}

const hasFiles = (transfer: DataTransfer | null): transfer is DataTransfer => transfer?.types.includes("Files") === true;

/** Wires dropping and pasting of image files to `host`. Returns a function that removes it. */
export function attachImageInput(host: ImageInputHost): () => void {
  const { target } = host;

  const add = async (files: File[], at: Point): Promise<void> => {
    const open = host.getFile();
    if (!open) return;
    const canvas = target.getBoundingClientRect();
    const { scale } = host.getView();
    const cap = { w: canvas.width / scale, h: canvas.height / scale };
    for (const [i, source] of files.entries()) {
      const file: ImageFile = { name: source.name, type: source.type, bytes: new Uint8Array(await source.arrayBuffer()) };
      try {
        const made = await addImage({
          storage: host.storage,
          diagramPath: open.path,
          doc: open.document,
          file,
          at: { x: at.x + i * STEP, y: at.y + i * STEP },
          cap,
          measure: measureInBrowser,
        });
        // The user may have opened another file while this one was read.
        if (host.getFile() !== open) return;
        open.history.execute(made.command, { selection: [made.id] });
        host.showError(null);
      } catch (e) {
        host.showError(e instanceof Error ? e.message : String(e));
      }
      host.refresh();
    }
  };

  const onDragOver = (event: DragEvent): void => {
    if (!hasFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };
  const onDrop = (event: DragEvent): void => {
    if (!hasFiles(event.dataTransfer)) return;
    event.preventDefault();
    const canvas = target.getBoundingClientRect();
    const at = screenToWorld(host.getView(), { x: event.clientX - canvas.left, y: event.clientY - canvas.top });
    void add([...event.dataTransfer.files], at);
  };
  const onPaste = (event: ClipboardEvent): void => {
    if (isTextEntry(event.target)) return;
    const files = [...(event.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;
    event.preventDefault();
    const canvas = target.getBoundingClientRect();
    void add(files, screenToWorld(host.getView(), { x: canvas.width / 2, y: canvas.height / 2 }));
  };

  target.addEventListener("dragover", onDragOver);
  target.addEventListener("drop", onDrop);
  addEventListener("paste", onPaste);
  return () => {
    target.removeEventListener("dragover", onDragOver);
    target.removeEventListener("drop", onDrop);
    removeEventListener("paste", onPaste);
  };
}
