// Image bytes that travel with a clipboard document for this session. The text cannot hold them.
import { assetFileName } from "../images/add.ts";
import { imageMime, resolveAsset } from "../images/path.ts";
import type { DiagramDocument } from "../model/index.ts";
import type { StorageAdapter } from "../storage/adapter.ts";

/** Bytes of the images in one clipboard document, keyed by the clipboard text. */
export class ClipboardImages {
  #held = new Map<string, Map<string, Uint8Array>>();

  remember(text: string, images: ReadonlyMap<string, Uint8Array>): void {
    const copy = new Map<string, Uint8Array>();
    for (const [src, bytes] of images) copy.set(src, bytes.slice());
    this.#held.set(text, copy);
  }

  recall(text: string): ReadonlyMap<string, Uint8Array> | undefined {
    return this.#held.get(text);
  }
}

/** Reads the images in `doc` and keeps their bytes under `text`. A file that cannot be read is left out. */
export async function rememberImageFiles(
  memory: ClipboardImages,
  text: string,
  storage: StorageAdapter,
  diagramPath: string,
  doc: DiagramDocument,
): Promise<void> {
  const images = new Map<string, Uint8Array>();
  for (const element of doc.elements) {
    if (element.kind !== "image") continue;
    const path = resolveAsset(diagramPath, element.src);
    if (!path) continue;
    try {
      images.set(element.src, await storage.read(path));
    } catch {
      // No bytes: the paste draws the dashed placeholder.
    }
  }
  memory.remember(text, images);
}

/**
 * Writes the remembered images into the target's `assets/` under unused names and returns the
 * document with `src` rewritten. An image with no bytes is unchanged, so it draws as a missing file.
 */
export async function pasteImageFiles(
  memory: ClipboardImages,
  text: string,
  storage: StorageAdapter,
  diagramPath: string,
  doc: DiagramDocument,
): Promise<DiagramDocument> {
  const held = memory.recall(text);
  if (!held || held.size === 0) return doc;
  const folder = diagramPath.includes("/") ? `${diagramPath.slice(0, diagramPath.lastIndexOf("/"))}/` : "";
  const taken = new Set((await storage.list()).map((file) => file.path));
  const renamed = new Map<string, string>();
  for (const element of doc.elements) {
    if (element.kind !== "image") continue;
    const file = held.get(element.src);
    const type = imageMime(element.src);
    if (!file || !type) continue;
    const name = assetFileName(element.src, type, taken, `${folder}assets/`);
    if (!name) continue;
    const src = `assets/${name}`;
    await storage.write(`${folder}${src}`, file);
    taken.add(`${folder}${src}`);
    renamed.set(element.id, src);
  }
  if (renamed.size === 0) return doc;
  return {
    ...doc,
    elements: doc.elements.map((element) => {
      const src = element.kind === "image" ? renamed.get(element.id) : undefined;
      return src ? { ...element, src } : element;
    }),
  };
}
