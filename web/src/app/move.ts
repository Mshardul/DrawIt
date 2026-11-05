import { resolveAsset } from "../images/path.ts";
import { readDiagram } from "../kdl/read.ts";
import { writeDiagram } from "../kdl/write.ts";
import { StorageError, type StorageAdapter } from "../storage/adapter.ts";
import { reviseRecent } from "./landing.ts";

const DIAGRAM_EXT = ".drawit.kdl";

export async function moveToProject(storage: StorageAdapter, from: string, project: string): Promise<string> {
  const diagram = readDiagram(new TextDecoder().decode(await storage.readLibrary(from))).document;
  const fileName = from.slice(from.lastIndexOf("/") + 1);
  if (!fileName.endsWith(DIAGRAM_EXT)) throw new StorageError("invalid-path", "not a diagram");
  const stem = fileName.slice(0, -DIAGRAM_EXT.length);
  let taken = true;
  try {
    await storage.readLibrary(`${project}/${stem}${DIAGRAM_EXT}`);
  } catch (error) {
    if (!(error instanceof StorageError) || error.code !== "not-found") throw error;
    taken = false;
  }
  if (taken) throw new StorageError("conflict", "name exists");

  const sources = new Map<string, string>();
  for (const element of diagram.elements) {
    if (element.kind !== "image" || sources.has(element.src)) continue;
    const asset = resolveAsset(from, element.src);
    if (asset === null) continue;
    try {
      await storage.readLibrary(asset);
    } catch (error) {
      // A missing image stays as written, so the target shows the same placeholder.
      if (error instanceof StorageError && error.code === "not-found") continue;
      throw error;
    }
    const copied = await storage.copyFile(asset, `${project}/assets`);
    sources.set(element.src, `assets/${copied.slice(copied.lastIndexOf("/") + 1)}`);
  }
  for (const element of diagram.elements) {
    if (element.kind !== "image") continue;
    const next = sources.get(element.src);
    if (next !== undefined) element.src = next;
  }
  const created = await storage.createDiagram(project, stem);
  await storage.replaceLibrary(created, new TextEncoder().encode(writeDiagram(diagram)));
  await storage.deleteItem(from, true);
  const patch = reviseRecent(await storage.readPreferences(), { type: "move", from, to: created });
  if (Object.keys(patch).length > 0) await storage.patchPreferences(patch);
  return created;
}
