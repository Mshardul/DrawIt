// Loads the image files of the open diagram. The API needs a token that an image request cannot
// carry, so each file is read through the storage adapter and shown from a blob URL. Reads happen
// the first time the renderer asks for a file, once; the app is told when one finishes.
import type { ImageLookup, ImageState } from "../render/images.ts";
import type { Size } from "../render/size.ts";
import type { StorageAdapter } from "../storage/adapter.ts";
import { imageMime, resolveAsset } from "./path.ts";

export interface ImageStoreOptions {
  storage: StorageAdapter;
  /** Called when a file finished loading or failed, so the app redraws. */
  onChange: () => void;
  /** The natural size of the image at `url`; rejects if the browser cannot decode it. */
  decode: (url: string) => Promise<Size>;
  createUrl: (blob: Blob) => string;
  revokeUrl: (url: string) => void;
}

export class ImageStore {
  readonly #options: ImageStoreOptions;
  #base = "";
  /** Bumped when the diagram changes, so a load that finishes late is dropped. */
  #epoch = 0;
  readonly #states = new Map<string, ImageState>();

  constructor(options: ImageStoreOptions) {
    this.#options = options;
  }

  /** Looks up images relative to the diagram file at `diagramPath`, forgetting those of the previous one. */
  setBase(diagramPath: string): void {
    this.#forget();
    this.#base = diagramPath;
  }

  /** Frees every blob URL. */
  dispose(): void {
    this.#forget();
  }

  readonly lookup: ImageLookup = (src) => {
    const path = resolveAsset(this.#base, src);
    if (path === null) return { status: "failed" };
    const known = this.#states.get(path);
    if (known) return known;
    const loading: ImageState = { status: "loading" };
    this.#states.set(path, loading);
    void this.#load(path, this.#epoch);
    return loading;
  };

  #forget(): void {
    this.#epoch++;
    for (const state of this.#states.values()) if (state.status === "ready") this.#options.revokeUrl(state.url);
    this.#states.clear();
  }

  async #load(path: string, epoch: number): Promise<void> {
    const { storage, decode, createUrl, revokeUrl, onChange } = this.#options;
    let url: string | undefined;
    let state: ImageState;
    try {
      const bytes = await storage.read(path);
      url = createUrl(new Blob([bytes as BlobPart], { type: imageMime(path) ?? "application/octet-stream" }));
      const size = await decode(url);
      state = { status: "ready", url, w: size.w, h: size.h };
    } catch {
      if (url !== undefined) revokeUrl(url);
      state = { status: "failed" };
    }
    if (epoch !== this.#epoch) {
      if (state.status === "ready") revokeUrl(state.url);
      return;
    }
    this.#states.set(path, state);
    onChange();
  }
}

/** Decodes with an `Image` element, which reads raster formats and SVG alike. */
export function decodeInBrowser(url: string): Promise<Size> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { resolve({ w: img.naturalWidth, h: img.naturalHeight }); };
    img.onerror = () => { reject(new Error("image cannot be decoded")); };
    img.src = url;
  });
}
