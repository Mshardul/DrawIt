import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadPacks, validateAll } from "./packs.ts";

const here = dirname(fileURLToPath(import.meta.url));
const REPO_PACKS = resolve(here, "..", "..", "packs");

const goodSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 80"><path data-role="fill" d="M 8 0 H 152 V 80 H 8 Z"/></svg>';
const goodShape = {
  id: "box", name: "Box", category: "Basic", tags: ["box"], svg: "box.svg", size: { w: 160, h: 80 },
  outline: "M 8 0 H 152 V 80 H 8 Z",
  anchors: { top: { x: 80, y: 0 }, right: { x: 152, y: 40 }, bottom: { x: 80, y: 80 }, left: { x: 8, y: 40 } },
  label: { x: 16, y: 8, w: 128, h: 64 }, keepAspect: false,
};

function makeRoot(svg: string): string {
  const root = mkdtempSync(join(tmpdir(), "packs-"));
  mkdirSync(join(root, "core"));
  writeFileSync(join(root, "core", "pack.json"), JSON.stringify({ pack: "core", version: 1, shapes: [goodShape] }));
  writeFileSync(join(root, "core", "box.svg"), svg);
  return root;
}

const run = (...args: string[]) => spawnSync("node", [join(here, "packs.ts"), ...args], { encoding: "utf8" });

describe("shape packs in the repository", () => {
  it("every pack under packs/ validates", () => {
    const packs = loadPacks(REPO_PACKS);
    expect(packs.map((p) => p.manifest.pack).sort()).toEqual(["arch", "core", "info"]);
    expect(validateAll(packs)).toEqual([]);
  });

  it("the three reference shapes exercise both axes, one axis and fixed ends", () => {
    const shapes = Object.fromEntries(loadPacks(REPO_PACKS).flatMap((p) => p.manifest.shapes.map((s) => [`${p.manifest.pack}.${s.id}`, s])));
    expect(shapes["core.rounded-rect"]?.stretch?.x).toBeDefined();
    expect(shapes["core.rounded-rect"]?.stretch?.y).toBeDefined();
    expect(shapes["arch.database"]?.stretch?.y).toBeDefined();
    expect(shapes["arch.database"]?.stretch?.x).toBeUndefined();
    expect(shapes["info.banner"]?.stretch?.x).toBeDefined();
    expect(shapes["info.banner"]?.stretch?.y).toBeUndefined();
  });
});

describe("pack tools", () => {
  it("validate exits 0 for a correct pack folder", () => {
    const result = run("validate", makeRoot(goodSvg));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("1 pack");
  });

  it("validate exits 1 and prints pack, shape and problem for a bad one", () => {
    const result = run("validate", makeRoot(goodSvg.replace('data-role="fill"', 'fill="#fff"')));
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/core\.box.*svg-attribute/);
  });

  it("validate on a folder with no packs fails", () => {
    expect(run("validate", mkdtempSync(join(tmpdir(), "empty-"))).status).toBe(1);
  });

  it("contact-sheet writes the page for valid packs", () => {
    const out = join(mkdtempSync(join(tmpdir(), "sheet-")), "index.html");
    const result = run("contact-sheet", out, makeRoot(goodSvg));
    expect(result.status).toBe(0);
    expect(existsSync(out)).toBe(true);
    expect(readFileSync(out, "utf8")).toContain('data-shape="core.box"');
  });

  it("contact-sheet refuses invalid packs and writes nothing", () => {
    const out = join(mkdtempSync(join(tmpdir(), "sheet-")), "index.html");
    const result = run("contact-sheet", out, makeRoot("<svg"));
    expect(result.status).toBe(1);
    expect(existsSync(out)).toBe(false);
  });
});
