// Puts `describeDiagram` output on the page. Groups are matched by `data-id`, so a drag that only
// changes `transform` touches one attribute (the fast path for drags) and an element whose content
// is unchanged keeps its DOM nodes. Two caches keep a drag's frames cheap: the groups under each
// root by ID, so a patch does not scan every child, and the content each group was built from, so
// an unchanged group is not written to at all. Both are filled by `mount`; change the children of a
// mounted root by other means and `patch` will not find them until the next `mount`.
import type { SvgNode } from "./describe.ts";

const SVG_NS = "http://www.w3.org/2000/svg";
/** The serialised children each group was last built from. */
const builtFrom = new WeakMap<Element, string>();
/** The groups under a root by `data-id`, as `mount` or the first `patch` found them. */
const groupsOf = new WeakMap<Element, Map<string, Element>>();

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

/**
 * Brings the children of `el` in line with `specs`. A child with the tag its spec names is kept and
 * only its attributes, text and children are rewritten: an edge that moves keeps its path, label
 * background and label text, and the browser has no new nodes to lay out. Any other child is rebuilt.
 */
function reconcile(el: Element, specs: SvgNode[]): void {
  const have = Array.from(el.children);
  specs.forEach((spec, i) => {
    const child = have[i];
    if (child?.localName !== spec.tag) {
      if (child) child.replaceWith(build(spec));
      else el.append(build(spec));
      return;
    }
    for (const name of child.getAttributeNames()) if (!(name in spec.attrs)) child.removeAttribute(name);
    setAttrs(child, spec.attrs);
    if (spec.text !== undefined) {
      if (child.textContent !== spec.text) child.textContent = spec.text;
    } else if (spec.children.length === 0 && child.childNodes.length > 0) {
      child.replaceChildren();
    }
    reconcile(child, spec.children);
  });
  for (const extra of have.slice(specs.length)) extra.remove();
}

/** Brings `el` in line with `spec`, touching its children only when their content changed. */
function update(el: Element, spec: SvgNode): void {
  const content = JSON.stringify(spec.children);
  setAttrs(el, spec.attrs);
  if (builtFrom.get(el) === content) return;
  reconcile(el, spec.children);
  builtFrom.set(el, content);
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
  const mounted = new Map<string, Element>();
  let previous: Element | null = null as Element | null;
  for (const spec of groups) {
    let el = existing.get(idOf(spec));
    if (el) {
      existing.delete(idOf(spec));
      update(el, spec);
    } else {
      el = build(spec);
      builtFrom.set(el, JSON.stringify(spec.children));
    }
    mounted.set(idOf(spec), el);
    const expectedPosition: Element | null = previous ? previous.nextElementSibling : root.firstElementChild;
    if (expectedPosition !== el) root.insertBefore(el, expectedPosition);
    previous = el;
  }
  for (const stale of existing.values()) stale.remove();
  groupsOf.set(root, mounted);
}

/**
 * Updates only the groups in `groups` that already exist under `root`, leaving every other child
 * and the order alone. A drag changes sizes and positions but never z-order, so it need not
 * visit the other elements.
 */
export function patch(root: Element, groups: SvgNode[]): void {
  let known = groupsOf.get(root);
  if (!known) {
    known = childrenById(root);
    groupsOf.set(root, known);
  }
  for (const spec of groups) {
    const el = known.get(idOf(spec));
    if (el?.parentNode === root) update(el, spec);
  }
}
