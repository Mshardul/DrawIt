// What an editing textarea shows. The textarea cannot wrap like the SVG text does (the browser also breaks
// after hyphens and at other places the line breaker does not), so it holds the text with a newline
// inserted wherever the wrap starts a new line. Its caret and selection then sit on the same lines as
// the drawn text. These functions map between that display text and the real text.

export interface EditView {
  /** The real text. */
  text: string;
  /** Offsets in `text` where a wrapped line starts after a soft break. */
  breaks: number[];
  /** `text` with a newline at each soft break. */
  display: string;
}

export interface Selection {
  start: number;
  end: number;
}

export interface DisplayEdit {
  text: string;
  /** In `text`. */
  selection: Selection;
}

const isBlank = (c: string | undefined): boolean => c === " " || c === "\t";

/**
 * Where `lines` (what the line breaker made of `text`) start a new line without an explicit line break.
 * The breaker drops the spaces at a soft break, so each break is placed after them.
 */
export function softBreaks(text: string, lines: string[]): number[] {
  const breaks: number[] = [];
  let pos = 0;
  let afterLineBreak = true;
  for (const line of lines) {
    if (!afterLineBreak) breaks.push(pos);
    pos += line.length;
    while (isBlank(text[pos])) pos++;
    afterLineBreak = text[pos] === "\n";
    if (afterLineBreak) pos++;
  }
  return breaks;
}

export function editView(text: string, lines: string[]): EditView {
  const breaks = softBreaks(text, lines);
  let display = "";
  let from = 0;
  for (const at of breaks) {
    display += `${text.slice(from, at)}\n`;
    from = at;
  }
  return { text, breaks, display: display + text.slice(from) };
}

/** The display index of a text index. On a soft break it is the start of the line that follows. */
export function displayIndex(breaks: number[], t: number): number {
  return t + breaks.filter((at) => at <= t).length;
}

/** The text index of a display index. Both sides of a soft break's newline give the break itself. */
export function modelIndex(breaks: number[], d: number): number {
  return d - breaks.filter((at, i) => at + i < d).length;
}

const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });

/** Start of the grapheme that ends at `end`. */
function graphemeBefore(text: string, end: number): number {
  let start = 0;
  for (const { index } of graphemes.segment(text.slice(0, end))) start = index;
  return start;
}

/** End of the grapheme that starts at `start`. */
function graphemeAfter(text: string, start: number): number {
  const first = graphemes.segment(text.slice(start))[Symbol.iterator]().next();
  return first.done ? start : start + first.value.segment.length;
}

/** `value` with Windows line breaks made plain, and `selection` moved to match. */
function withPlainBreaks(value: string, selection: Selection): { value: string; selection: Selection } {
  if (!value.includes("\r")) return { value, selection };
  const shift = (index: number): number => index - (value.slice(0, index).match(/\r\n/g)?.length ?? 0);
  return { value: value.replaceAll("\r\n", "\n"), selection: { start: shift(selection.start), end: shift(selection.end) } };
}

/**
 * The real text after the user changed the display text to `next`, with `selection` (in `next`) mapped
 * back. The change is found as the one stretch that differs. Deleting only a soft newline would change
 * nothing in the text, so it deletes the character before it (backspace) or after it (delete).
 */
export function applyDisplayEdit(prev: EditView, next: string, selection: Selection, inputType = ""): DisplayEdit {
  const plain = withPlainBreaks(next, selection);
  const after = plain.value;
  const before = prev.display;

  let p = 0;
  while (p < before.length && p < after.length && before[p] === after[p]) p++;
  let q = 0;
  while (q < before.length - p && q < after.length - p && before[before.length - 1 - q] === after[after.length - 1 - q]) q++;
  const removedEnd = before.length - q;
  const inserted = after.slice(p, after.length - q);

  let from = modelIndex(prev.breaks, p);
  let to = modelIndex(prev.breaks, removedEnd);
  if (inserted === "" && removedEnd > p && from === to) {
    if (inputType === "deleteContentForward") to = graphemeAfter(prev.text, to);
    else from = graphemeBefore(prev.text, from);
  }

  const text = prev.text.slice(0, from) + inserted + prev.text.slice(to);
  const insertedEnd = p + inserted.length;
  const shift = from + inserted.length - to;
  const map = (c: number): number => {
    let t: number;
    if (c <= p) t = Math.min(modelIndex(prev.breaks, c), from);
    else if (c <= insertedEnd) t = from + (c - p);
    else t = modelIndex(prev.breaks, c - insertedEnd + removedEnd) + shift;
    return Math.max(0, Math.min(text.length, t));
  };
  return { text, selection: { start: map(plain.selection.start), end: map(plain.selection.end) } };
}
