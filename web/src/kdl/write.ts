// Canonical KDL writer: the document model to `.drawit.kdl` text.
// The inverse of `readDiagram`; the same model always produces the same bytes.
import { Node, format } from "@bgotink/kdl";
import type {
  Anchor,
  DiagramDocument,
  DiagramElement,
  KdlValue,
  LayoutEntry,
  Point,
  StyleProps,
  UnknownNode,
} from "../model/index.ts";

/** Human text: always written as a quoted string, even when KDL would allow a bare word. */
class Quoted {
  readonly text: string;
  constructor(text: string) {
    this.text = text;
  }
}

type Arg = KdlValue | Quoted;
type Field = readonly [name: string, value: Arg | undefined];

const INDENT = "  ";

// Fixed property order of the style groups: [model key, file key].
const STYLE_ORDER = [
  ["fill", "fill"], ["opacity", "opacity"],
  ["stroke", "stroke"], ["strokeWidth", "stroke-width"], ["dash", "dash"], ["radius", "radius"],
  ["shadow", "shadow"],
  ["font", "font"], ["size", "size"], ["weight", "weight"], ["italic", "italic"], ["underline", "underline"],
  ["color", "color"], ["align", "align"], ["lineHeight", "line-height"],
  ["route", "route"], ["headStart", "head-start"], ["headEnd", "head-end"],
] as const;

const ESCAPES: Record<string, string> = { "\\": "\\\\", '"': '\\"', "\n": "\\n", "\r": "\\r", "\t": "\\t", "\b": "\\b", "\f": "\\f" };

function quote(text: string): string {
  const body = text.replace(/[\\"\p{Cc}\u2028\u2029]/gu, (c) => ESCAPES[c] ?? `\\u{${c.charCodeAt(0).toString(16)}}`);
  return `"${body}"`;
}

/** One KDL node on one line, formatted by the parser library so quoting and escaping are always valid. */
function nodeLine(name: string, args: readonly Arg[], props: readonly Field[]): string {
  const node = Node.create(name);
  for (const arg of args) node.addArgument(arg instanceof Quoted ? arg.text : arg);
  node.getArgumentEntries().forEach((entry, i) => {
    const arg = args[i];
    if (arg instanceof Quoted) entry.value.representation = quote(arg.text);
  });
  for (const [key, v] of props) {
    if (v === undefined) continue;
    node.setProperty(key, v instanceof Quoted ? v.text : v);
    if (v instanceof Quoted) {
      const entry = node.getPropertyEntry(key);
      if (entry) entry.value.representation = quote(v.text);
    }
  }
  return format(node).trim();
}

const q = (text: string): Quoted => new Quoted(text);
const quoted = (text: string | undefined): Quoted | undefined => (text === undefined ? undefined : q(text));

function extFields(ext: Record<string, KdlValue> | undefined): Field[] {
  return ext ? Object.entries(ext) : [];
}

function point(p: Point): string {
  return `${String(Math.round(p.x))},${String(Math.round(p.y))}`;
}

function anchor(a: Anchor | undefined): string | undefined {
  if (a === undefined || a === "auto") return a;
  return a.at === undefined ? a.side : `${a.side}:${String(a.at)}`;
}

class Writer {
  readonly lines: string[] = [];

  push(depth: number, text: string): void {
    this.lines.push(INDENT.repeat(depth) + text);
  }

  comments(depth: number, comments: readonly string[] | undefined): void {
    for (const comment of comments ?? []) this.push(depth, comment);
  }

  blank(): void {
    this.lines.push("");
  }

  unknown(node: UnknownNode, depth: number): void {
    this.comments(depth, node.comments);
    const head = nodeLine(node.name, node.args, Object.entries(node.props));
    if (node.children.length === 0) {
      this.push(depth, head);
      return;
    }
    this.push(depth, `${head} {`);
    for (const child of node.children) this.unknown(child, depth + 1);
    this.push(depth, "}");
  }
}

function elementLine(element: Exclude<DiagramElement, { kind: "unknown" }>): string {
  const cls: Field = ["class", element.class];
  const ext = extFields(element.ext);
  switch (element.kind) {
    case "node":
      return nodeLine("node", element.label === undefined ? [element.id] : [element.id, q(element.label)], [
        ["shape", element.shape], cls, ...ext,
      ]);
    case "frame":
      return nodeLine("frame", element.name === undefined ? [element.id] : [element.id, q(element.name)], [cls, ...ext]);
    case "text":
      return nodeLine("text", [element.id, q(element.content)], [cls, ...ext]);
    case "image":
      return nodeLine("image", [element.id], [["src", q(element.src)], cls, ...ext]);
    case "shape":
      return nodeLine("shape", [element.id], [["shape", element.shape], cls, ...ext]);
    case "edge": {
      const from = element.from ?? "-";
      const to = element.to ?? "-";
      const derived = element.from !== null && element.to !== null && element.id === `${from}->${to}`;
      return nodeLine("edge", [from, to], [
        ["id", derived ? undefined : element.id], ["label", quoted(element.label)], cls, ...ext,
      ]);
    }
  }
}

function styleFields(props: StyleProps): Field[] {
  const fields: Field[] = STYLE_ORDER.map(([key, name]) => [name, props[key]]);
  return [...fields, ...extFields(props.ext)];
}

function layoutLine(entry: LayoutEntry, isEdge: boolean): string {
  const round = (n: number | undefined): number | undefined => (n === undefined ? undefined : Math.round(n));
  return nodeLine(entry.id, [], [
    ["x", isEdge ? undefined : round(entry.x)],
    ["y", isEdge ? undefined : round(entry.y)],
    ["w", round(entry.w)],
    ["h", round(entry.h)],
    ["locked", entry.locked ? true : undefined],
    ["from", anchor(entry.from)],
    ["to", anchor(entry.to)],
    ["from-point", entry.fromPoint && point(entry.fromPoint)],
    ["to-point", entry.toPoint && point(entry.toPoint)],
    ["via", entry.via && entry.via.length > 0 ? entry.via.map(point).join(" ") : undefined],
    ["label-at", entry.labelAt],
    ...extFields(entry.ext),
  ]);
}

/** Writes the document as canonical KDL: header, structure, style, layout. Empty style and layout sections are left out. */
export function writeDiagram(document: DiagramDocument): string {
  const w = new Writer();

  w.comments(0, document.comments);
  const header = nodeLine("diagram", [], [["version", document.version], ["title", quoted(document.title)]]);
  if (document.plugins.length === 0) {
    w.push(0, header);
  } else {
    w.push(0, `${header} {`);
    w.push(1, nodeLine("plugins", document.plugins.map((p) => `${p.id}@${String(p.version)}`), []));
    w.push(0, "}");
  }

  if (document.elements.length > 0) {
    w.blank();
    for (const element of document.elements) {
      if (element.kind === "unknown") {
        w.unknown(element.node, 0);
      } else {
        w.comments(0, element.comments);
        w.push(0, elementLine(element));
      }
    }
  }

  const { theme, classes, overrides, unknown } = document.style;
  const tokenLines: string[] = [];
  for (const [kind, tokens] of [["color", theme.colors], ["font", theme.fonts], ["size", theme.sizes], ["space", theme.spaces]] as const) {
    if (Object.keys(tokens).length > 0) tokenLines.push(nodeLine(kind, [], Object.entries(tokens)));
  }
  if (tokenLines.length + classes.length + overrides.length + (unknown?.length ?? 0) > 0) {
    w.blank();
    w.push(0, "style {");
    if (tokenLines.length > 0) {
      w.push(1, `${nodeLine("theme", [theme.name], [])} {`);
      for (const text of tokenLines) w.push(2, text);
      w.push(1, "}");
    }
    for (const c of classes) w.push(1, nodeLine("class", [c.name], styleFields(c.props)));
    for (const o of overrides) w.push(1, nodeLine("el", [o.id], styleFields(o.props)));
    for (const node of unknown ?? []) w.unknown(node, 1);
    w.push(0, "}");
  }

  const kinds = new Map(document.elements.map((e) => [e.id, e.kind]));
  const entries = document.layout.filter((entry) => kinds.has(entry.id));
  if (entries.length > 0) {
    w.blank();
    w.push(0, "layout {");
    for (const entry of entries) w.push(1, layoutLine(entry, kinds.get(entry.id) === "edge"));
    w.push(0, "}");
  }

  return `${w.lines.join("\n")}\n`;
}
