// Shape pack tools.
//
//   node tools/packs.ts validate [packs-dir]              check every pack; exit 1 on any problem
//   node tools/packs.ts contact-sheet [out] [packs-dir]   write the contact sheet page; refuses invalid packs
//
// The packs live in `packs/` at the repository root: one folder per pack with `pack.json` and one SVG per shape.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderContactSheet } from "../src/shapes/contact-sheet.ts";
import { validatePackFiles } from "../src/shapes/pack-loader.ts";
import type { PackManifest, Problem } from "../src/shapes/types.ts";

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PACKS = resolve(here, "..", "..", "packs");
const DEFAULT_SHEET = resolve(here, "..", "contact-sheet", "index.html");

export interface LoadedPack {
  dir: string;
  /** Text of `pack.json`. */
  manifestText: string;
  manifest: PackManifest;
  svgs: Record<string, string>;
  /** Set when pack.json is not JSON. */
  parseError?: string;
}

/** Reads every folder under `root` that has a `pack.json`. */
export function loadPacks(root: string): LoadedPack[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(root, d.name, "pack.json")))
    .map((d) => {
      const dir = join(root, d.name);
      const svgs = Object.fromEntries(
        readdirSync(dir)
          .filter((f) => f.endsWith(".svg"))
          .map((f) => [f, readFileSync(join(dir, f), "utf8")]),
      );
      const manifestText = readFileSync(join(dir, "pack.json"), "utf8");
      try {
        return { dir, manifestText, manifest: JSON.parse(manifestText) as PackManifest, svgs };
      } catch (e) {
        return { dir, manifestText, manifest: null as unknown as PackManifest, svgs, parseError: e instanceof Error ? e.message : String(e) };
      }
    });
}

/** Every problem in `packs`, including a folder name that differs from its pack id and repeated pack ids. */
export function validateAll(packs: LoadedPack[]): Problem[] {
  return validatePackFiles(packs.map((p) => ({ folder: p.dir.split(/[\\/]/).at(-1) ?? "", manifest: p.manifestText, svgs: p.svgs })));
}

const plural = (n: number, word: string): string => `${String(n)} ${word}${n === 1 ? "" : "s"}`;

function checked(root: string): LoadedPack[] | null {
  const packs = loadPacks(root);
  if (packs.length === 0) {
    console.error(`no packs found in ${root}`);
    return null;
  }
  const problems = validateAll(packs);
  for (const p of problems) console.error(`${p.pack}${p.shape === undefined ? "" : `.${p.shape}`} ${p.code} ${p.message}`);
  return problems.length === 0 ? packs : null;
}

export function main(argv: string[]): number {
  const [command, ...rest] = argv;
  if (command === "validate") {
    const packs = checked(rest[0] ?? DEFAULT_PACKS);
    if (!packs) return 1;
    console.log(`validated ${plural(packs.length, "pack")}, ${plural(packs.reduce((n, p) => n + p.manifest.shapes.length, 0), "shape")}`);
    return 0;
  }
  if (command === "contact-sheet") {
    const out = rest[0] ?? DEFAULT_SHEET;
    const packs = checked(rest[1] ?? DEFAULT_PACKS);
    if (!packs) return 1;
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, renderContactSheet(packs));
    console.log(`wrote ${out}`);
    return 0;
  }
  console.error("usage: node tools/packs.ts validate [packs-dir] | contact-sheet [out] [packs-dir]");
  return 1;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
