// Where an `image` element's file is: a workspace path from the `src` as written. The file is
// untrusted input, so only a relative path to a raster or SVG image inside the folder resolves.

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
};

/** The media type for an image file's extension, or undefined when it is not an image type the app draws. */
export function imageMime(path: string): string | undefined {
  const dot = path.lastIndexOf(".");
  return dot < 0 || path.lastIndexOf("/") > dot ? undefined : MIME[path.slice(dot + 1).toLowerCase()];
}

/**
 * The workspace path of `src`, resolved against the folder of the diagram file `diagramPath`; null
 * for anything that is not a relative path to an image inside the workspace: an absolute path, a
 * URL, a path that steps out of the folder, or a file that is not an image type.
 */
export function resolveAsset(diagramPath: string, src: string): string | null {
  if (src.includes("\\") || src.includes("\0") || src.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(src)) return null;
  const parts = diagramPath.split("/").slice(0, -1);
  for (const part of src.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (parts.pop() === undefined) return null;
    } else {
      parts.push(part);
    }
  }
  const path = parts.join("/");
  return src.endsWith("/") || imageMime(path) === undefined ? null : path;
}

/** The file extension for an image media type, or undefined when the type is not one the app draws. */
export function extensionForMime(type: string): string | undefined {
  const lower = type.toLowerCase();
  return lower === "image/jpeg" ? "jpg" : Object.keys(MIME).find((ext) => MIME[ext] === lower);
}
