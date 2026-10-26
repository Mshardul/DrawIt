// A small parser for the SVG subset shape packs use: elements, quoted attributes, comments. It
// refuses everything else (doctypes, entities, CDATA, text), so a pack cannot smuggle anything in.
// Pure TypeScript with no DOM, so the validator runs in Node and the app runs it in the browser.

export interface SvgEl {
  tag: string;
  attrs: Record<string, string>;
  children: SvgEl[];
}

const NAME = /[A-Za-z][\w:.-]*/y;
const ATTR = /\s*([A-Za-z][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/y;

/** Parses `text` into its root element. Throws an Error naming what is wrong. */
export function parseSvg(text: string): SvgEl {
  const stack: SvgEl[] = [];
  let root: SvgEl | null = null;
  let i = 0;
  while (i < text.length) {
    const lt = text.indexOf("<", i);
    const chunk = text.slice(i, lt === -1 ? text.length : lt);
    if (chunk.trim() !== "") throw new Error(`text content is not allowed: "${chunk.trim().slice(0, 20)}"`);
    if (lt === -1) break;
    i = lt;
    if (text.startsWith("<!--", i)) {
      const end = text.indexOf("-->", i + 4);
      if (end === -1) throw new Error("unterminated comment");
      i = end + 3;
    } else if (text.startsWith("<?", i)) {
      const end = text.indexOf("?>", i + 2);
      if (end === -1) throw new Error("unterminated declaration");
      i = end + 2;
    } else if (text.startsWith("<![CDATA[", i)) {
      throw new Error("CDATA is not allowed");
    } else if (text.startsWith("<!DOCTYPE", i)) {
      throw new Error("DOCTYPE is not allowed");
    } else if (text.startsWith("<!", i)) {
      throw new Error("declarations are not allowed");
    } else if (text.startsWith("</", i)) {
      const end = text.indexOf(">", i);
      if (end === -1) throw new Error("unterminated closing tag");
      const name = text.slice(i + 2, end).trim();
      const open = stack.pop();
      if (!open || open.tag !== name) throw new Error(`closing tag </${name}> does not match ${open ? `<${open.tag}>` : "an open element"}`);
      i = end + 1;
    } else {
      NAME.lastIndex = i + 1;
      const name = NAME.exec(text)?.[0];
      if (!name) throw new Error("expected an element name after <");
      const el: SvgEl = { tag: name, attrs: {}, children: [] };
      i += 1 + name.length;
      for (;;) {
        ATTR.lastIndex = i;
        const m = ATTR.exec(text);
        if (!m) break;
        el.attrs[m[1] as string] = m[2] ?? m[3] ?? "";
        i = ATTR.lastIndex;
      }
      while (/\s/.test(text[i] ?? "")) i++;
      const selfClosing = text.startsWith("/>", i);
      if (!selfClosing && text[i] !== ">") throw new Error(`malformed tag <${name}`);
      i += selfClosing ? 2 : 1;
      const parent = stack.at(-1);
      if (parent) parent.children.push(el);
      else if (root) throw new Error("an SVG file has exactly one root element");
      else root = el;
      if (!selfClosing) stack.push(el);
    }
  }
  if (stack.length > 0) throw new Error(`<${stack.at(-1)?.tag ?? ""}> is not closed`);
  if (!root) throw new Error("no root element");
  return root;
}
