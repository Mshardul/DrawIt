# DrawIt

Read these before changing anything:

- `docs/File Format Spec v1.md`: what DrawIt does and the file format.
- `docs/decisions.md`: why, and what was rejected. Check it before proposing a different design.
- `docs/tickets.md`: the work. Follow its Format section exactly when editing the table.

## Rules

- Code never mentions tickets, decisions, spec sections or project status: not in comments, test titles, test names, log labels or identifiers. Those references live in `docs/` only. Comments explain a non-obvious why, nothing else.
- Do not copy a convention from surrounding code because it is there. Decide what is right for this codebase and apply that, and if existing code has the wrong convention, fix it where you touch it.
- Test-first: write the failing test, then the code.
- Docs describe the current state only. Edit rows and paragraphs in place; never write changelog wording ("replaces", "no longer", "now", "was", "removed"). Git holds the history.
- No UI framework without asking. The renderer is our own SVG.
- Do not bundle vendor icon sets.
