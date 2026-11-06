// Copy, cut and paste. The clipboard text is written during the event; image bytes are read after it.
import { isTextEntry } from "../app/text-entry.ts";
import type { OpenFile } from "../app/workspace.ts";
import { deleteCommand } from "../edit/delete.ts";
import { writeDiagram } from "../kdl/write.ts";
import type { Point } from "../model/index.ts";
import { layoutById } from "../model/lookup.ts";
import type { StorageAdapter } from "../storage/adapter.ts";
import type { TextMeasurer } from "../text/measure.ts";
import { recogniseClipboard } from "./copy.ts";
import { ClipboardImages, pasteImageFiles, rememberImageFiles } from "./images.ts";
import { pasteCommand, pastePoint, selectionDocument } from "./paste.ts";

export interface ClipboardHost {
  getFile(): OpenFile | null;
  storage: StorageAdapter;
  measurer: TextMeasurer;
  images: ClipboardImages;
  /** World point while the pointer is over the canvas, otherwise null. */
  pointer(): Point | null;
  /** Where an image file lands when the pointer is off the canvas. */
  imageFallback(): Point;
  placeImages(files: File[], at: Point): Promise<void>;
  refresh(): void;
}

/** The clipboard text for the selection, or null when nothing is selected. */
export function clipboardText(file: OpenFile, measurer: TextMeasurer): string | null {
  if (file.history.selection.length === 0) return null;
  const clip = selectionDocument(file.document, file.history.selection, measurer);
  if (clip.elements.length === 0) return null;
  return writeDiagram(clip);
}

/** Copies, then deletes the unlocked selection as one undo step. Locked elements stay. */
export function cutSelection(file: OpenFile, measurer: TextMeasurer): string | null {
  const text = clipboardText(file, measurer);
  if (text === null) return null;
  const command = deleteCommand(file.document, measurer, file.history.selection);
  if (command) {
    const entries = layoutById(file.document);
    const staying = file.history.selection.filter((id) => entries.get(id)?.locked === true);
    file.history.execute(command, { selection: staying });
  }
  return text;
}

/** Pastes a DrawIt document. Returns false when the text is not one, leaving the file unchanged. */
export async function pasteDocument(
  file: OpenFile,
  storage: StorageAdapter,
  images: ClipboardImages,
  measurer: TextMeasurer,
  text: string,
  at: Point,
): Promise<boolean> {
  const recognised = recogniseClipboard(text);
  if (!recognised) return false;
  const prepared = await pasteImageFiles(images, text, storage, file.path, recognised);
  const result = pasteCommand(file.document, prepared, measurer, at);
  if (result) file.history.execute(result.command, { selection: result.selection });
  return true;
}

function imageFiles(transfer: DataTransfer | null): File[] {
  return [...(transfer?.files ?? [])].filter((file) => file.type.startsWith("image/"));
}

/** Wires copy, cut and paste. Returns a function that removes them. */
export function attachClipboard(host: ClipboardHost): () => void {
  const hold = (file: OpenFile, text: string): void => {
    const clip = recogniseClipboard(text);
    if (clip) void rememberImageFiles(host.images, text, host.storage, file.path, clip);
  };

  const onCopy = (event: ClipboardEvent): void => {
    const file = host.getFile();
    if (!file || isTextEntry(event.target)) return;
    const text = clipboardText(file, host.measurer);
    if (text === null) return;
    event.preventDefault();
    event.clipboardData?.setData("text/plain", text);
    hold(file, text);
  };

  const onCut = (event: ClipboardEvent): void => {
    const file = host.getFile();
    if (!file || isTextEntry(event.target)) return;
    const text = cutSelection(file, host.measurer);
    if (text === null) return;
    event.preventDefault();
    event.clipboardData?.setData("text/plain", text);
    hold(file, text);
    host.refresh();
  };

  const onPaste = (event: ClipboardEvent): void => {
    const file = host.getFile();
    if (!file || isTextEntry(event.target)) return;
    const text = event.clipboardData?.getData("text/plain") ?? "";
    const recognised = recogniseClipboard(text);
    if (recognised) {
      event.preventDefault();
      const at = pastePoint(host.pointer(), recognised);
      void pasteDocument(file, host.storage, host.images, host.measurer, text, at).then(() => { host.refresh(); });
      return;
    }
    const files = imageFiles(event.clipboardData);
    if (files.length === 0) return;
    event.preventDefault();
    void host.placeImages(files, host.pointer() ?? host.imageFallback());
  };

  addEventListener("copy", onCopy);
  addEventListener("cut", onCut);
  addEventListener("paste", onPaste);
  return () => {
    removeEventListener("copy", onCopy);
    removeEventListener("cut", onCut);
    removeEventListener("paste", onPaste);
  };
}
