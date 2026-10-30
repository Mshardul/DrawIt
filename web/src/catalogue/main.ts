// The live shape catalogue, served by the dev server at /catalogue.html. It reads the pack files
// through the same glob the app uses, so a changed, added or removed file shows up on its own.
import { bundledPacks } from "../shapes/bundled-packs.ts";
import { CATALOGUE_STYLE, catalogueBody, problemList } from "../shapes/catalogue.ts";
import { validatePackFiles } from "../shapes/pack-loader.ts";
import type { PackManifest } from "../shapes/types.ts";

const style = document.createElement("style");
style.textContent = CATALOGUE_STYLE;
document.head.append(style);

// A pack whose manifest cannot be read still shows its SVG files, as ones no shape names.
const parsed = bundledPacks.map((files) => {
  try {
    return { manifest: JSON.parse(files.manifest) as PackManifest, svgs: files.svgs };
  } catch {
    return { manifest: { pack: files.folder, version: 1, shapes: [] }, svgs: files.svgs };
  }
});

const root = document.getElementById("catalogue");
if (root) root.innerHTML = problemList(validatePackFiles(bundledPacks)) + catalogueBody(parsed);
