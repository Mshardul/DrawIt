import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pages = ["index.html"];
const assets = ["style.css"];

export function build({ name, outDir }) {
  mkdirSync(outDir, { recursive: true });
  for (const page of pages) {
    const source = readFileSync(join(here, "src", page), "utf8");
    writeFileSync(join(outDir, page), source.replaceAll("{{NAME}}", name));
  }
  for (const asset of assets) {
    copyFileSync(join(here, "src", asset), join(outDir, asset));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  build({ name: process.env.SITE_NAME ?? "DrawIt", outDir: join(here, "dist") });
}
