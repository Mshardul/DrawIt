// KDL v2 reader (spec 4, decision F1): `.drawit.kdl` text to the document model.
import { InvalidKdlError, parse } from "@bgotink/kdl";
import type { Document, Node } from "@bgotink/kdl";
import { isValidId } from "../model/index.ts";
import type {
  Anchor,
  DiagramDocument,
  DiagramElement,
  KdlValue,
  LayoutEntry,
  Point,
  Side,
  StyleProps,
  Theme,
  UnknownNode,
} from "../model/index.ts";

/** The file is not valid KDL (decision E2). `line` and `column` start at 1. */
export class KdlSyntaxError extends Error {
  readonly line: number;
  readonly column: number;

  constructor(reason: string, line: number, column: number) {
    super(`line ${String(line)}, column ${String(column)}: ${reason}`);
    this.name = "KdlSyntaxError";
    this.line = line;
    this.column = column;
  }
}

export interface ReadResult {
  document: DiagramDocument;
  /** Things dropped or ignored that the author may want to know about. */
  warnings: string[];
}

const DROPPED_COMMENTS = "End-of-line and block comments are dropped; only whole-line // comments are kept";

const STYLE_KEYS = new Set([
  "fill", "opacity", "stroke", "strokeWidth", "dash", "radius", "shadow",
  "font", "size", "weight", "italic", "underline", "color", "align", "lineHeight",
  "route", "headStart", "headEnd",
]);

const SIDES = new Set<string>(["top", "right", "bottom", "left"]);

type Props = Map<string, KdlValue>;

function value(raw: unknown): KdlValue {
  if (raw === null || typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") return raw;
  return typeof raw === "bigint" ? Number(raw) : null;
}

function argsOf(node: Node): KdlValue[] {
  return node.getArguments().map(value);
}

function propsOf(node: Node): Props {
  const props: Props = new Map();
  for (const entry of node.entries) {
    if (entry.name) props.set(entry.name.getName(), value(entry.value.value));
  }
  return props;
}

function childrenOf(node: Node): Node[] {
  return node.children?.nodes ?? [];
}

function camel(key: string): string {
  return key.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function isNumber(v: KdlValue | undefined): v is number {
  return typeof v === "number";
}

function isString(v: KdlValue | undefined): v is string {
  return typeof v === "string";
}

class Reader {
  readonly warnings: string[] = [];
  private droppedComments = false;
  private unknowns = 0;

  /** Whole-line comments above a node; anything else next to it is dropped with one warning. */
  comments(node: Node): string[] {
    const kept: string[] = [];
    for (const line of (node.leading ?? "").split("\n")) {
      const text = line.trim();
      if (text.startsWith("//")) kept.push(text);
      else if (text) this.droppedComments = true;
    }
    if (/\/\/|\/\*/.test(node.trailing ?? "")) this.droppedComments = true;
    return kept;
  }

  warnIfCommentsDropped(): void {
    if (this.droppedComments) this.warnings.push(DROPPED_COMMENTS);
  }

  unknownNode(node: Node): UnknownNode {
    const comments = this.comments(node);
    const result: UnknownNode = {
      name: node.name.getName(),
      args: argsOf(node),
      props: Object.fromEntries(propsOf(node)),
      children: childrenOf(node).map((child) => this.unknownNode(child)),
    };
    if (comments.length > 0) result.comments = comments;
    return result;
  }

  unknownElement(node: Node): DiagramElement {
    this.unknowns++;
    const first = node.getArguments()[0];
    const id = typeof first === "string" && isValidId(first) ? first : `unknown-${String(this.unknowns)}`;
    return { kind: "unknown", id, node: this.unknownNode(node) };
  }

  /** Splits properties into the named ones, removed from `props`, and the rest as `ext`. */
  rest(props: Props): Record<string, KdlValue> | undefined {
    return props.size > 0 ? Object.fromEntries(props) : undefined;
  }

  ignoreChildren(node: Node, where: string): void {
    if (childrenOf(node).length > 0) this.warnings.push(`Children of ${where} are ignored`);
  }

  element(node: Node): DiagramElement {
    const name = node.name.getName();
    const args = argsOf(node);
    const props = propsOf(node);
    const take = (key: string): string | undefined => {
      const v = props.get(key);
      if (!isString(v)) return undefined;
      props.delete(key);
      return v;
    };
    const comments = this.comments(node);
    const [first, second] = args;
    let element: DiagramElement | null = null;

    if (isString(first)) {
      switch (name) {
        case "node": {
          const shape = take("shape");
          if (shape !== undefined && (second === undefined || isString(second))) {
            element = { kind: "node", id: first, shape };
            if (second !== undefined) element.label = second;
          }
          break;
        }
        case "frame":
          if (second === undefined || isString(second)) {
            element = { kind: "frame", id: first };
            if (second !== undefined) element.name = second;
          }
          break;
        case "text":
          if (isString(second)) element = { kind: "text", id: first, content: second };
          break;
        case "image": {
          const src = take("src");
          if (src !== undefined) element = { kind: "image", id: first, src };
          break;
        }
        case "shape": {
          const shape = take("shape");
          if (shape !== undefined) element = { kind: "shape", id: first, shape };
          break;
        }
        case "edge": {
          if (isString(second) && args.length === 2) {
            const from = first === "-" ? null : first;
            const to = second === "-" ? null : second;
            const id = take("id") ?? `${first}->${second}`;
            element = { kind: "edge", id, from, to };
            const label = take("label");
            if (label !== undefined) element.label = label;
          }
          break;
        }
      }
    }
    const maxArgs = name === "image" || name === "shape" ? 1 : 2;
    if (!element || args.length > maxArgs) return this.unknownElement(node);

    const cls = take("class");
    if (cls !== undefined) element.class = cls;
    const ext = this.rest(props);
    if (ext) element.ext = ext;
    if (comments.length > 0) element.comments = comments;
    this.ignoreChildren(node, `${name} ${element.id}`);
    return element;
  }

  styleProps(props: Props): StyleProps {
    const result: Record<string, unknown> = {};
    const ext: Record<string, KdlValue> = {};
    for (const [key, v] of props) {
      const name = camel(key);
      if (STYLE_KEYS.has(name)) result[name] = v;
      else ext[key] = v;
    }
    if (Object.keys(ext).length > 0) result["ext"] = ext;
    return result;
  }

  tokens<T extends string | number>(node: Node, into: Record<string, T>, ok: (v: KdlValue) => v is T): void {
    for (const [key, v] of propsOf(node)) {
      if (ok(v)) into[key] = v;
    }
  }

  style(node: Node, doc: DiagramDocument): void {
    this.comments(node);
    let themeSeen = false;
    for (const child of childrenOf(node)) {
      const keyword = child.name.getName();
      const args = argsOf(child);
      const first = args[0];
      if (keyword === "theme" && !themeSeen) {
        themeSeen = true;
        this.comments(child);
        const theme: Theme = { name: isString(first) ? first : "default", colors: {}, fonts: {}, sizes: {}, spaces: {} };
        for (const entry of childrenOf(child)) {
          const kind = entry.name.getName();
          this.comments(entry);
          if (kind === "color") this.tokens(entry, theme.colors, isString);
          else if (kind === "font") this.tokens(entry, theme.fonts, isString);
          else if (kind === "size") this.tokens(entry, theme.sizes, isNumber);
          else if (kind === "space") this.tokens(entry, theme.spaces, isNumber);
          else this.warnings.push(`Theme statement "${kind}" is ignored`);
        }
        doc.style.theme = theme;
      } else if ((keyword === "class" || keyword === "el") && isString(first)) {
        this.comments(child);
        const props = this.styleProps(propsOf(child));
        if (keyword === "class") doc.style.classes.push({ name: first, props });
        else doc.style.overrides.push({ id: first, props });
      } else {
        (doc.style.unknown ??= []).push(this.unknownNode(child));
      }
    }
  }

  layout(node: Node, doc: DiagramDocument): void {
    this.comments(node);
    for (const child of childrenOf(node)) {
      this.comments(child);
      const props = propsOf(child);
      const number = (key: string): number | undefined => {
        const v = props.get(key);
        if (!isNumber(v)) return undefined;
        props.delete(key);
        return v;
      };
      const entry: LayoutEntry = { id: child.name.getName(), x: number("x") ?? 0, y: number("y") ?? 0 };
      const w = number("w");
      if (w !== undefined) entry.w = w;
      const h = number("h");
      if (h !== undefined) entry.h = h;
      if (props.get("locked") === true) {
        entry.locked = true;
        props.delete("locked");
      }
      for (const key of ["from", "to"] as const) {
        const anchor = parseAnchor(props.get(key));
        if (anchor !== undefined) {
          entry[key] = anchor;
          props.delete(key);
        }
      }
      for (const [key, field] of [["from-point", "fromPoint"], ["to-point", "toPoint"]] as const) {
        const point = parsePoints(props.get(key));
        if (point?.length === 1 && point[0]) {
          entry[field] = point[0];
          props.delete(key);
        }
      }
      const via = parsePoints(props.get("via"));
      if (via) {
        entry.via = via;
        props.delete("via");
      }
      const labelAt = number("label-at");
      if (labelAt !== undefined) entry.labelAt = labelAt;
      const ext = this.rest(props);
      if (ext) entry.ext = ext;
      doc.layout.push(entry);
    }
  }
}

function parseAnchor(v: KdlValue | undefined): Anchor | undefined {
  if (!isString(v)) return undefined;
  if (v === "auto") return "auto";
  const [side, at, ...extra] = v.split(":");
  if (!side || !SIDES.has(side) || extra.length > 0) return undefined;
  if (at === undefined) return { side: side as Side };
  const position = Number(at);
  return at !== "" && Number.isFinite(position) ? { side: side as Side, at: position } : undefined;
}

function parsePoints(v: KdlValue | undefined): Point[] | undefined {
  if (!isString(v)) return undefined;
  const points: Point[] = [];
  for (const part of v.trim().split(/\s+/)) {
    const [x, y, ...extra] = part.split(",");
    if (x === undefined || y === undefined || extra.length > 0 || x === "" || y === "") return undefined;
    const point = { x: Number(x), y: Number(y) };
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return undefined;
    points.push(point);
  }
  return points.length > 0 ? points : undefined;
}

function parseSource(text: string): Document {
  try {
    return parse(text);
  } catch (error) {
    if (error instanceof InvalidKdlError) {
      const reason = error.message.replace(/ at \d+:\d+$/, "");
      throw new KdlSyntaxError(reason, error.start?.line ?? 1, error.start?.column ?? 1);
    }
    throw error;
  }
}

/** Reads a `.drawit.kdl` file. Only KDL syntax is checked (decision F21); a syntax error throws `KdlSyntaxError`. */
export function readDiagram(text: string): ReadResult {
  const source = parseSource(text);
  const reader = new Reader();
  const document: DiagramDocument = {
    version: 1,
    plugins: [],
    elements: [],
    style: { theme: { name: "default", colors: {}, fonts: {}, sizes: {}, spaces: {} }, classes: [], overrides: [] },
    layout: [],
  };

  for (const node of source.nodes) {
    switch (node.name.getName()) {
      case "diagram": {
        const comments = reader.comments(node);
        if (comments.length > 0) document.comments = comments;
        const props = propsOf(node);
        const version = props.get("version");
        if (isNumber(version)) document.version = version;
        const title = props.get("title");
        if (isString(title)) document.title = title;
        for (const child of childrenOf(node)) {
          if (child.name.getName() !== "plugins") continue;
          for (const ref of argsOf(child)) {
            const match = isString(ref) ? /^(.+)@(\d+)$/.exec(ref) : null;
            if (match?.[1] && match[2]) document.plugins.push({ id: match[1], version: Number(match[2]) });
          }
        }
        break;
      }
      case "style":
        reader.style(node, document);
        break;
      case "layout":
        reader.layout(node, document);
        break;
      default:
        document.elements.push(reader.element(node));
    }
  }
  reader.warnIfCommentsDropped();
  return { document, warnings: reader.warnings };
}
