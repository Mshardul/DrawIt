// Spike T-008: own line-breaking for SVG text (decision A8).
// Lines break only between whitespace-separated words, and a word wider than the box is split between
// graphemes (Intl.Segmenter). Word-granularity segments are not line-break opportunities: they split
// "e.g." into "e.g" and ".", and engines disagree on such runs. Widths come from an injected measure
// function (canvas in the browser).
export type Measure = (text: string) => number;

const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });

// Split text that is wider than maxWidth between characters, one grapheme at a time.
function splitWide(text: string, maxWidth: number, measure: Measure): string[] {
  const lines: string[] = [];
  let line = "";
  for (const { segment } of graphemes.segment(text)) {
    if (line !== "" && measure(line + segment) > maxWidth) {
      lines.push(line);
      line = segment;
    } else {
      line += segment;
    }
  }
  lines.push(line);
  return lines;
}

function breakParagraph(paragraph: string, maxWidth: number, measure: Measure): string[] {
  const lines: string[] = [];
  let line = "";
  for (const segment of paragraph.split(/(\s+)/)) {
    // Trailing spaces hang past the edge, so only the trimmed line has to fit.
    if (measure((line + segment).trimEnd()) <= maxWidth) {
      line += segment;
      continue;
    }
    if (line !== "") lines.push(line.trimEnd());
    const word = segment.trimStart();
    if (measure(word.trimEnd()) <= maxWidth) {
      line = word;
      continue;
    }
    const pieces = splitWide(word.trimEnd(), maxWidth, measure);
    line = pieces.pop() ?? "";
    lines.push(...pieces);
  }
  lines.push(line.trimEnd());
  return lines;
}

export function breakLines(text: string, maxWidth: number, measure: Measure): string[] {
  return text.split("\n").flatMap((paragraph) => breakParagraph(paragraph, maxWidth, measure));
}
