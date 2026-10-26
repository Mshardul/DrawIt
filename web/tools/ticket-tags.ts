// Ticket-ID test tagging (decision Q2, spec 7.3).
//
// TypeScript tests (Vitest, Playwright) carry the tag in the title: "[T-001] ...".
// Go tests carry it in the function name: TestT001_Name.
//
//   node tools/ticket-tags.ts check        every test is tagged with a ticket in docs/tickets.md
//   node tools/ticket-tags.ts run T-001    run only the tests tagged T-001; fail if none are tagged
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface SourceFile {
  path: string;
  content: string;
}

export interface TaggedCounts {
  unit: number;
  e2e: number;
  go: number;
}

type Kind = keyof TaggedCounts;

interface TestCase {
  kind: Kind;
  line: number;
  tag: string | null;
}

const TS_TEST = /^\s*(?:test|it)(?:\.\w+)?\(\s*(['"`])(.*?)\1/;
const TS_TAG = /\[(T-\d{3})\]/;
const GO_TEST = /^func (Test\w*)\(/;
const GO_TAG = /^Test_?T(\d{3})_/;

export function ticketIdsFromTable(markdown: string): Set<string> {
  const ids = new Set<string>();
  for (const line of markdown.split("\n")) {
    const match = /^\|\s*(T-\d{3})\s*\|/.exec(line);
    if (match?.[1]) ids.add(match[1]);
  }
  return ids;
}

function kindOf(path: string): Kind | null {
  if (path.endsWith("_test.go")) return "go";
  if (path.endsWith(".spec.ts")) return "e2e";
  if (path.endsWith(".test.ts")) return "unit";
  return null;
}

function testsIn(file: SourceFile): TestCase[] {
  const kind = kindOf(file.path);
  if (!kind) return [];
  const cases: TestCase[] = [];
  file.content.split("\n").forEach((text, index) => {
    const line = index + 1;
    if (kind === "go") {
      const name = GO_TEST.exec(text)?.[1];
      if (name) {
        const digits = GO_TAG.exec(name)?.[1];
        cases.push({ kind, line, tag: digits ? `T-${digits}` : null });
      }
      return;
    }
    const title = TS_TEST.exec(text)?.[2];
    if (title !== undefined) cases.push({ kind, line, tag: TS_TAG.exec(title)?.[1] ?? null });
  });
  return cases;
}

export function findTagProblems(files: SourceFile[], known: Set<string>): string[] {
  const problems: string[] = [];
  for (const file of files) {
    for (const test of testsIn(file)) {
      const where = `${file.path}:${String(test.line)}`;
      if (!test.tag) problems.push(`${where}: test has no ticket tag`);
      else if (!known.has(test.tag)) problems.push(`${where}: ${test.tag} is not in docs/tickets.md`);
    }
  }
  return problems;
}

export function countTagged(files: SourceFile[], ticket: string): TaggedCounts {
  const counts: TaggedCounts = { unit: 0, e2e: 0, go: 0 };
  for (const file of files) {
    for (const test of testsIn(file)) if (test.tag === ticket) counts[test.kind] += 1;
  }
  return counts;
}

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "test-results", "playwright-report"]);

function collectTestFiles(root: string, dir = root): SourceFile[] {
  const files: SourceFile[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) files.push(...collectTestFiles(root, full));
    } else if (kindOf(entry.name)) {
      files.push({ path: relative(root, full), content: readFileSync(full, "utf8") });
    }
  }
  return files;
}

function run(command: string, args: string[], cwd: string): number {
  console.log(`$ ${command} ${args.join(" ")}`);
  return spawnSync(command, args, { cwd, stdio: "inherit" }).status ?? 1;
}

function main(argv: string[]): number {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const webDir = join(repoRoot, "web");
  const files = collectTestFiles(repoRoot);
  const known = ticketIdsFromTable(readFileSync(join(repoRoot, "docs", "tickets.md"), "utf8"));
  const [command, ticket] = argv;

  if (command === "check") {
    const problems = findTagProblems(files, known);
    for (const problem of problems) console.error(problem);
    console.log(
      problems.length === 0
        ? `ticket tags ok (${String(files.length)} test files)`
        : `${String(problems.length)} tagging problem(s)`,
    );
    return problems.length === 0 ? 0 : 1;
  }

  if (command === "run" && ticket) {
    if (!known.has(ticket)) {
      console.error(`${ticket} is not in docs/tickets.md`);
      return 1;
    }
    const counts = countTagged(files, ticket);
    if (counts.unit + counts.e2e + counts.go === 0) {
      console.error(`no tests are tagged ${ticket}`);
      return 1;
    }
    const grep = `\\[${ticket}\\]`;
    const goName = `^Test_?${ticket.replace("-", "")}_`;
    let status = 0;
    if (counts.unit) status ||= run("vitest", ["run", "-t", grep], webDir);
    if (counts.e2e) status ||= run("playwright", ["test", "--grep", grep], webDir);
    if (counts.go) status ||= run("go", ["test", "./...", "-run", goName], repoRoot);
    return status;
  }

  console.error("usage: ticket-tags.ts check | run T-NNN");
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
