import { KdlSyntaxError, readDiagram } from "../kdl/read.ts";
import type { DiagramDocument } from "../model/index.ts";
import { describeDiagram, type SvgNode } from "../render/describe.ts";
import { describeDefs } from "../render/defs.ts";
import type { ImageLookup } from "../render/images.ts";
import type { TextMeasurer } from "../text/measure.ts";
import { documentBounds } from "../view/view.ts";

/** A file larger than this is not drawn. */
export const THUMBNAIL_LIMIT = 1024 * 1024;

export interface ThumbnailPicture {
  status: "ready";
  viewBox: string;
  defs: SvgNode[];
  nodes: SvgNode[];
}

export type Thumbnail =
  | ThumbnailPicture
  | { status: "invalid"; message: string; line: number; column: number }
  | { status: "too-large" };

export type CardFace =
  | { kind: "message"; tone: "load" | "bad" | "big"; text: string; title?: string }
  | { kind: "picture"; viewBox: string; defs: SvgNode[]; nodes: SvgNode[] };

/** The face a card shows for a picture, or for a file that is not ready. */
export function cardFace(picture: Thumbnail | null): CardFace {
  if (picture === null) return { kind: "message", tone: "load", text: "Drawing…" };
  if (picture.status === "too-large") return { kind: "message", tone: "big", text: "Too large to preview" };
  if (picture.status === "invalid") return { kind: "message", tone: "bad", text: "Can't open this file", title: picture.message };
  return { kind: "picture", viewBox: picture.viewBox, defs: picture.defs, nodes: picture.nodes };
}

export interface ThumbnailSource {
  read(path: string): Promise<Uint8Array>;
  /** The images of this file, never those of the diagram that is open. */
  images(path: string): ImageLookup;
}

/** The diagram as one SVG picture, fitted to the bounds of what it draws. */
export function renderThumbnail(doc: DiagramDocument, measurer: TextMeasurer, images: ImageLookup): ThumbnailPicture {
  const bounds = documentBounds(doc, measurer);
  const viewBox = bounds === null ? "0 0 1 1" : `${String(bounds.x)} ${String(bounds.y)} ${String(bounds.w)} ${String(bounds.h)}`;
  return { status: "ready", viewBox, defs: describeDefs(doc), nodes: describeDiagram(doc, measurer, { images }) };
}

/** Pictures for this session, keyed by path and modified time. A read parses the file and does not open it. */
export class ThumbnailCache {
  readonly #pictures = new Map<string, Thumbnail>();
  readonly #source: ThumbnailSource;
  readonly #measurer: TextMeasurer;

  constructor(source: ThumbnailSource, measurer: TextMeasurer) {
    this.#source = source;
    this.#measurer = measurer;
  }

  async picture(path: string, modified: string, size: number): Promise<Thumbnail> {
    const key = `${path}\0${modified}`;
    const cached = this.#pictures.get(key);
    if (cached) return cached;
    const picture = size > THUMBNAIL_LIMIT ? { status: "too-large" as const } : await this.#read(path);
    this.#pictures.set(key, picture);
    return picture;
  }

  async #read(path: string): Promise<Thumbnail> {
    const text = new TextDecoder().decode(await this.#source.read(path));
    try {
      return renderThumbnail(readDiagram(text).document, this.#measurer, this.#source.images(path));
    } catch (error) {
      if (error instanceof KdlSyntaxError) return { status: "invalid", message: error.message, line: error.line, column: error.column };
      throw error;
    }
  }
}
