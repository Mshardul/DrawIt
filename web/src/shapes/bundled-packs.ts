// The packs in `packs/` at the repository root, read at build time so they work offline and load like the fonts.
import { createPackLoader, type PackFiles } from "./pack-loader.ts";

const FILES = import.meta.glob<string>(["../../../packs/*/pack.json", "../../../packs/*/*.svg"], {
  query: "?raw",
  import: "default",
  eager: true,
});

function bundle(): PackFiles[] {
  const packs = new Map<string, PackFiles>();
  for (const [path, text] of Object.entries(FILES)) {
    const [folder, file] = path.split("/").slice(-2) as [string, string];
    const pack = packs.get(folder) ?? { folder, manifest: "", svgs: {} };
    packs.set(folder, pack);
    if (file === "pack.json") pack.manifest = text;
    else pack.svgs[file] = text;
  }
  return [...packs.values()];
}

export const bundledPacks: readonly PackFiles[] = bundle();

/** The loader over the bundled packs. */
export const bundledLoader = createPackLoader(bundledPacks);
