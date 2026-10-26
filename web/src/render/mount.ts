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

/** Brings `el` in line with `spec`, rebuilding its children only when their content changed. */
function update(el: Element, spec: SvgNode): void {
  const content = JSON.stringify(spec.children);
  setAttrs(el, spec.attrs);
  if (el.getAttribute(CONTENT) !== content) el.replaceChildren(...spec.children.map(build));
  el.setAttribute(CONTENT, content);
}

const idOf = (spec: SvgNode): string => String(spec.attrs["data-id"]);

function childrenById(root: Element): Map<string, Element> {
  const byId = new Map<string, Element>();
  for (const child of Array.from(root.children)) {
    const id = child.getAttribute("data-id");
    if (id !== null) byId.set(id, child);
  }
  return byId;
}

/** Makes the children of `root` match `groups`, in order. */
export function mount(root: Element, groups: SvgNode[]): void {
  const existing = childrenById(root);
  let previous: Element | null = null as Element | null;
  for (const spec of groups) {
    let el = existing.get(idOf(spec));
    if (el) {
      existing.delete(idOf(spec));
      update(el, spec);
    } else {
      el = build(spec);
      el.setAttribute(CONTENT, JSON.stringify(spec.children));
    }
    const expectedPosition: Element | null = previous ? previous.nextElementSibling : root.firstElementChild;
    if (expectedPosition !== el) root.insertBefore(el, expectedPosition);
    previous = el;
  }
  for (const stale of existing.values()) stale.remove();
}

/**
 * Updates only the groups in `groups` that already exist under `root`, leaving every other child
 * and the order alone. A drag changes sizes and positions but never z-order, so it need not
 * visit the other elements.
 */
export function patch(root: Element, groups: SvgNode[]): void {
  const existing = childrenById(root);
  for (const spec of groups) {
    const el = existing.get(idOf(spec));
    if (el) update(el, spec);
  }
}
