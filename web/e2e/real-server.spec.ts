import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const repo = fileURLToPath(new URL("../..", import.meta.url));

let home = "";
let tools = "";
let server: ChildProcess | undefined;
let url = "";

test.beforeAll(async () => {
  test.setTimeout(180_000);
  home = mkdtempSync(join(tmpdir(), "drawit-home-"));
  tools = mkdtempSync(join(tmpdir(), "drawit-bin-"));
  const binary = join(tools, "drawit");
  execFileSync("go", ["build", "-o", binary, "./cmd/drawit"], { cwd: repo });
  const child = spawn(binary, ["-no-browser"], { env: { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, ".config") } });
  server = child;
  url = await new Promise<string>((resolve, reject) => {
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString();
      const found = /at (http:\/\/\S+)/.exec(out);
      if (found?.[1]) resolve(found[1]);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      out += chunk.toString();
    });
    child.on("exit", () => {
      reject(new Error(`drawit exited before it printed its address: ${out}`));
    });
  });
});

test.afterAll(() => {
  server?.kill();
  rmSync(home, { recursive: true, force: true });
  rmSync(tools, { recursive: true, force: true });
});

test("a start with no remembered folder opens the library on Home", async ({ page }) => {
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "Draw your first diagram" })).toBeVisible();
  await expect(page.getByText("could not read the folder")).toHaveCount(0);
});
