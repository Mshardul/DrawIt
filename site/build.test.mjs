import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { build } from "./build.mjs";

const out = () => mkdtempSync(join(tmpdir(), "site-"));

test("the product name is substituted in every page", () => {
  const dir = out();
  build({ name: "Sketchy", outDir: dir });
  const html = readFileSync(join(dir, "index.html"), "utf8");
  assert.match(html, /Sketchy/);
  assert.doesNotMatch(html, /\{\{/);
});

test("the stylesheet is copied next to the page", () => {
  const dir = out();
  build({ name: "DrawIt", outDir: dir });
  assert.ok(readdirSync(dir).includes("style.css"));
});

test("the page loads nothing from another origin", () => {
  const dir = out();
  build({ name: "DrawIt", outDir: dir });
  const html = readFileSync(join(dir, "index.html"), "utf8");
  const css = readFileSync(join(dir, "style.css"), "utf8");
  assert.doesNotMatch(html, /(src|href)="https?:\/\/(?!github\.com)/);
  assert.doesNotMatch(css, /url\(\s*["']?https?:/);
});

test("the download button points at the latest release", () => {
  const dir = out();
  build({ name: "DrawIt", outDir: dir });
  const html = readFileSync(join(dir, "index.html"), "utf8");
  assert.match(html, /github\.com\/Mshardul\/DrawIt\/releases\/latest/);
});
