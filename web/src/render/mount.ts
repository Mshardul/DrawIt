// Puts `describeDiagram` output on the page. It keeps no state of its own: the DOM it finds under
// `root` is what it compares with. Groups are matched by `data-id`, so a drag that only changes
// `transform` touches one attribute (the T-009 spike's fast path) and an element whose content is
// unchanged keeps its DOM nodes.
import type { SvgNode } from "./describe.ts";

const SVG_NS = "http://www.w3.org/2000/svg";
/** Holds the serialised children a group was last built from, so unchanged content is not rebuilt. */
const CONTENT = "data-content";

function build(spec: SvgNode): SVGElement {
  const el = document.createElementNS(SVG_NS, spec.tag);
  for (const [name, value] of Object.entries(spec.attrs)) el.setAttribute(name, String(value));
  if (spec.text !== undefined) el.textContent = spec.text;
  for (const child of spec.children) el.append(build(child));
  return el;
}

function setAttrs(el: Element, attrs: SvgNode["attrs"]): void {
  for (const [name, value] of Object.entries(attrs)) {
    const text = String(value);
    if (el.getAttribute(name) !== text) el.setAttribute(name, text);
  }
}

/** Makes the children of `root` match `groups`, in order. */
export function mount(root: Element, groups: SvgNode[]): void {
  const existing = new Map<string, Element>();
  for (const child of Array.from(root.children)) {
    const id = child.getAttribute("data-id");
    if (id !== null) existing.set(id, child);
  }

  let previous: Element | null = null as Element | null;
  for (const spec of groups) {
    const id = String(spec.attrs["data-id"]);
    const content = JSON.stringify(spec.children);
    let el = existing.get(id);
    if (el) {
      existing.delete(id);
      setAttrs(el, spec.attrs);
      if (el.getAttribute(CONTENT) !== content) el.replaceChildren(...spec.children.map(build));
    } else {
      el = build(spec);
    }
    el.setAttribute(CONTENT, content);
    const expectedPosition: Element | null = previous ? previous.nextElementSibling : root.firstElementChild;
    if (expectedPosition !== el) root.insertBefore(el, expectedPosition);
    previous = el;
  }
  for (const stale of existing.values()) stale.remove();
}
