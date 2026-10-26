import { describe, expect, it } from "vitest";
import {
  countTagged,
  findTagProblems,
  ticketIdsFromTable,
  type SourceFile,
} from "./ticket-tags.ts";

const known = new Set(["T-001", "T-002"]);
const ts = (path: string, content: string): SourceFile => ({ path, content });

describe("ticket tags", () => {
  it("[T-001] reads ticket IDs from the tickets table", () => {
    const md = "| ID | Phase |\n|---|---|\n| T-001 | 0 |\n| T-017 | 0 |\nT-999 outside the table\n";
    expect([...ticketIdsFromTable(md)]).toEqual(["T-001", "T-017"]);
  });

  it("[T-001] accepts a tagged TypeScript test", () => {
    const f = ts("a.test.ts", "  it('[T-001] does a thing', () => {});\n");
    expect(findTagProblems([f], known)).toEqual([]);
  });

  it("[T-001] fails a TypeScript test with no tag", () => {
    const f = ts("a.test.ts", "it('does a thing', () => {});\n");
    const problems = findTagProblems([f], known);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("a.test.ts:1");
  });

  it("[T-001] fails a tag that names no ticket", () => {
    const f = ts("a.spec.ts", "test('[T-777] ghost', async () => {});\n");
    expect(findTagProblems([f], known)[0]).toContain("T-777");
  });

  it("[T-001] checks Go tests by function name", () => {
    const ok = ts("a_test.go", "func TestT001_Scaffold(t *testing.T) {}\n");
    const bad = ts("b_test.go", "func TestScaffold(t *testing.T) {}\n");
    expect(findTagProblems([ok], known)).toEqual([]);
    expect(findTagProblems([bad], known)).toHaveLength(1);
  });

  it("[T-001] counts tests selected by a ticket tag", () => {
    const files = [
      ts("a.test.ts", "it('[T-001] one', () => {});\nit('[T-002] two', () => {});\n"),
      ts("b_test.go", "func TestT001_Go(t *testing.T) {}\n"),
      ts("c.spec.ts", "test('[T-001] e2e', async () => {});\n"),
    ];
    expect(countTagged(files, "T-001")).toEqual({ unit: 1, e2e: 1, go: 1 });
  });

  it("[T-001] selects nothing for an untagged ticket", () => {
    const files = [ts("a.test.ts", "it('[T-001] one', () => {});\n")];
    expect(countTagged(files, "T-002")).toEqual({ unit: 0, e2e: 0, go: 0 });
  });
});
