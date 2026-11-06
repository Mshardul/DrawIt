import type { DiagramDocument } from "../model/index.ts";
import { imageMime, resolveAsset } from "../images/path.ts";
import { bytesToBase64 } from "./fonts.ts";

export async function imageHrefs(
  doc: DiagramDocument,
  diagramPath: string,
  storage: { read(path: string): Promise<Uint8Array> },
  ids?: ReadonlySet<string>,
): Promise<Map<string, string>> {
  const hrefs = new Map<string, string>();
  for (const element of doc.elements) {
    if (element.kind !== "image" || (ids && !ids.has(element.id)) || hrefs.has(element.src)) continue;
    const path = resolveAsset(diagramPath, element.src);
    const mime = path ? imageMime(path) : undefined;
    if (!path || !mime) continue;
    try {
      hrefs.set(element.src, `data:${mime};base64,${bytesToBase64(await storage.read(path))}`);
    } catch {
      // The canvas draws a placeholder; the export does the same.
    }
  }
  return hrefs;
}
