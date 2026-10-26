# DrawIt

Read these before changing anything:

- `docs/File Format Spec v1.md`: what DrawIt does and the file format.
- `docs/decisions.md`: why, and what was rejected. Check it before proposing a different design.
- `docs/tickets.md`: the work. Follow its Format section exactly when editing the table.

## Rules

- Tests are tagged with the ID of the ticket they verify. TypeScript: `[T-001]` in the test title. Go: `TestT001_Name`. `pnpm check:tags` (in `web/`) fails on an untagged test; `pnpm test:ticket T-001` runs one ticket's tests and fails if none exist.
- Test-first: write the failing test, then the code.
- Docs describe the current state only. Edit rows and paragraphs in place; never write changelog wording ("replaces", "no longer", "now", "was", "removed"). Git holds the history.
- No UI framework without asking. The renderer is our own SVG.
- Do not bundle vendor icon sets.
