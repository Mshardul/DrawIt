import { KdlSyntaxError, readDiagram } from "../kdl/read.ts";
import { projectNameCheck, type NameCheck } from "./names.ts";

export type ImportCheck = { ok: true } | { ok: false; message: string };

/** A file can be copied into a project when it is a diagram and the text parses. */
export function importCheck(name: string, text: string): ImportCheck {
  const file = name.slice(name.lastIndexOf("/") + 1);
  if (!file.endsWith(".drawit.kdl") || file.includes("\\")) return { ok: false, message: "Choose a .drawit.kdl file." };
  try {
    readDiagram(text);
    return { ok: true };
  } catch (error) {
    if (error instanceof KdlSyntaxError) return { ok: false, message: `Can't import: ${error.message}` };
    throw error;
  }
}

export interface Crumb {
  label: string;
  path: string;
}

/** Home, then each folder from there to `path`. */
export function browseCrumbs(home: string, path: string): Crumb[] {
  const root = home === "" ? "/" : home;
  const crumbs: Crumb[] = [{ label: "Home", path: root }];
  if (path === root || path === "") return crumbs;
  const relative = root === "/" ? path.slice(1) : path.startsWith(`${root}/`) ? path.slice(root.length + 1) : "";
  if (relative === "") return crumbs;
  let built = root === "/" ? "" : root;
  for (const part of relative.split("/")) {
    if (part === "") continue;
    built = `${built}/${part}`;
    crumbs.push({ label: part, path: built });
  }
  return crumbs;
}

/** A folder name in the browser: the same characters as a project, and not one already listed. */
export function folderNameCheck(name: string, existing: readonly string[]): NameCheck {
  const check = projectNameCheck(name, existing);
  if (check.ok || check.message === "") return check;
  const found = existing.find((entry) => entry.toLowerCase() === name.toLowerCase());
  if (found === undefined) return check;
  return { ok: false, message: `A folder named "${found}" already exists.` };
}
