// Adding an image file to the diagram: the file is saved in `assets/` next to the diagram and an
// `image` element refers to it. Pure apart from the storage adapter and the function that reads the
// file's natural size, so it is tested without a browser.
import type { Command } from "../commands/command.ts";
import { type DiagramDocument, type Point, unusedId } from "../model/index.ts";
import { IMAGE_SIZE, type Size } from "../render/size.ts";
import { assertFitsLimit, type StorageAdapter } from "../storage/adapter.ts";
import { decodeInBrowser } from "./store.ts";
import { extensionForMime, imageMime } from "./path.ts";

export interface ImageFile {
  /** As the browser reports it: a dropped file's name, empty or `image.png` for a pasted one. */
  name: string;
  type: string;
  bytes: Uint8Array;
}

/**
 * The size an image is drawn at: its natural size, or smaller to fit the canvas with its aspect kept.
 * It is never scaled up. A canvas with no size yet (zero) does not limit it.
 */
export function fitSize(natural: Size, canvas: Size): Size {
  const scale = canvas.w > 0 && canvas.h > 0 ? Math.min(1, canvas.w / natural.w, canvas.h / natural.h) : 1;
  return { w: Math.max(1, Math.round(natural.w * scale)), h: Math.max(1, Math.round(natural.h * scale)) };
}

/** A name safe to use for both a file and an ID: lower case letters, digits, `-` and `_`. */
function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * The name to save a file under: its own, made safe, with an extension that matches its type, and
 * a number added until no path in `taken` (each with `prefix` before the name) uses it. Null if the
 * file is not an image type the app draws.
 */
export function assetFileName(original: string, type: string, taken: ReadonlySet<string>, prefix = ""): string | null {
  const base = original.split(/[/\\]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  const ownExtension = dot > 0 && imageMime(base) !== undefined;
  const ext = ownExtension ? base.slice(dot + 1).toLowerCase() : extensionForMime(type);
  if (ext === undefined) return null;
  const stem = slug(dot > 0 ? base.slice(0, dot) : base) || "image";
  let name = `${stem}.${ext}`;
  for (let n = 2; taken.has(`${prefix}${name}`); n++) name = `${stem}-${String(n)}.${ext}`;
  return name;
}

/** An ID for an image built from its file name: starts with a letter, as IDs must. */
function idBase(fileName: string): string {
  const stem = fileName.slice(0, fileName.lastIndexOf("."));
  return /^[a-z]/.test(stem) ? stem : `image-${stem}`;
}

export interface AddImage {
  storage: StorageAdapter;
  /** The open diagram's path; the file goes into an `assets/` folder next to it. */
  diagramPath: string;
  doc: DiagramDocument;
  file: ImageFile;
  /** The world point the image is centred on. */
  at: Point;
  /** The visible canvas in world px; the image is made to fit it. */
  cap: Size;
  /** The natural size of the file; rejects if it cannot be read as an image. */
  measure: (file: ImageFile) => Promise<Size>;
}

/**
 * Saves the file and returns the command that adds the image, and its ID. Rejects, having written
 * nothing, for a file that is not an image, is too large, or that the browser cannot read.
 */
export async function addImage({ storage, diagramPath, doc, file, at, cap, measure }: AddImage): Promise<{ command: Command; id: string }> {
  const folder = diagramPath.includes("/") ? `${diagramPath.slice(0, diagramPath.lastIndexOf("/"))}/` : "";
  const taken = new Set((await storage.list()).map((f) => f.path));
  const name = assetFileName(file.name, file.type, taken, `${folder}assets/`);
  if (name === null) throw new Error(`${file.name || "The pasted file"} is not a supported image (PNG, JPEG, GIF, WebP, AVIF or SVG)`);
  assertFitsLimit(name, file.bytes);
  let natural: Size;
  try {
    natural = await measure({ ...file, type: imageMime(name) ?? file.type });
  } catch {
    throw new Error(`${file.name || "The pasted file"} cannot be read as an image`);
  }
  await storage.write(`${folder}assets/${name}`, file.bytes);
  const size = fitSize(natural.w > 0 && natural.h > 0 ? natural : { w: IMAGE_SIZE, h: IMAGE_SIZE }, cap);
  const id = unusedId(doc.elements, idBase(name));
  const layout = { id, x: Math.round(at.x - size.w / 2), y: Math.round(at.y - size.h / 2), ...size };
  return { command: { type: "add", items: [{ element: { kind: "image", id, src: `assets/${name}` }, layout }] }, id };
}

/** Reads a file's natural size with an `Image`, through a blob URL that is freed afterwards. */
export async function measureInBrowser(file: ImageFile): Promise<Size> {
  const url = URL.createObjectURL(new Blob([file.bytes as BlobPart], { type: file.type }));
  try {
    return await decodeInBrowser(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}
