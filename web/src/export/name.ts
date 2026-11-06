import { FILE_EXTENSION } from "../app/workspace.ts";

export function exportFileName(diagramPath: string, frameId: string | null, format: "svg" | "png"): string {
  const file = diagramPath.slice(diagramPath.lastIndexOf("/") + 1);
  const stem = file.endsWith(FILE_EXTENSION) ? file.slice(0, -FILE_EXTENSION.length) : file;
  return `${frameId ? `${stem}-${frameId}` : stem}.${format}`;
}
