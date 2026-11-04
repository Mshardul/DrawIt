// What the renderer knows about image files: whether a file is loaded and how big it is. The store
// that reads the files is in images/store.ts; the renderer and the size rules only see this lookup.

export type ImageState =
  | { status: "loading" }
  | { status: "ready"; url: string; w: number; h: number }
  | { status: "failed" };

/** Finds the state of an image by the `src` written in the file. */
export type ImageLookup = (src: string) => ImageState;

const unknown: ImageLookup = () => ({ status: "loading" });

let current: ImageLookup = unknown;

/** The lookup in use for the open diagram; every image is loading until `useImages` sets one. */
export const openImages: ImageLookup = (src) => current(src);

/** Sets the lookup `openImages` answers with. */
export function useImages(lookup: ImageLookup): void {
  current = lookup;
}
