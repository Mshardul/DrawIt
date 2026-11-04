# DrawIt — Plan for phase 7

Build order and scope for clipboard and export. The spec says what DrawIt does, `decisions.md` records each design choice and `tickets.md` holds the work; this file does not repeat them.

## Phase 7: output

**Outcome:** an author copies, cuts and pastes elements within a file and between files, and downloads the canvas, a selection or a frame as a sharp SVG or PNG at 1x, 2x or 3x, whatever the canvas zoom.

**Out of scope**
- Pasting plain text as a text box, and PDF export (later).
- A separate performance ticket: paste and export are not drawing or dragging (Q17), so their budgets are tests inside their own tickets.

**Build order**
- The clipboard needs only the model and the commands, so it can run beside phase 6: the copy side and recogniser, then the paste builder, then images across files, then the events and cut, which also needs the status pill's pointer tracker (T-120 to T-123).
- Export needs the diagram bounds from phase 6. The spike comes first and its outcome is written into the decisions before the rest: SVG core, frame scope, fonts and images, PNG, then the dialog and the Download button, which also needs the file pill (T-124 to T-129).
