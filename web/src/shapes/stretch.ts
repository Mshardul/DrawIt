// Shape stretch (decision A15): the cut lines of a manifest map design coordinates to coordinates
// at the shape's size on the canvas. Parts outside the cut lines keep their size and move; parts
// between scale. The mapping is applied to the numbers of the SVG, so no shape needs its own code.
import { formatPath, type PathSegment, parsePath } from "./path.ts";
import type { SvgEl } from "./svg.ts";
import type { Cuts, Point, Size, Stretch } from "./types.ts";

/** Maps `v` (0..size) to 0..newSize. A target narrower than the fixed parts shrinks them together and collapses the middle. */
export function stretchAxis(v: number, size: number, newSize: number, cuts?: Cuts): number {
  if (!cuts) return (v * newSize) / size;
  const [a, b] = cuts;
  const fixed = a + (size - b);
  if (newSize >= fixed) {
    if (v <= a) return v;
    if (v >= b) return v + (newSize - size);
    return a + ((v - a) * (newSize - fixed)) / (b - a);
  }
  const f = newSize / fixed;
  if (v <= a) return v * f;
  if (v >= b) return newSize - (size - v) * f;
  return a * f;
}

/** How much a length at `v` grows: 1 in a fixed part, the stretch factor in the middle. */
export function axisScale(v: number, size: number, newSize: number, cuts?: Cuts): number {
  if (!cuts) return newSize / size;
  const [a, b] = cuts;
  const fixed = a + (size - b);
  const middle = v > a && v < b;
  if (newSize >= fixed) return middle ? (newSize - fixed) / (b - a) : 1;
  return middle ? 0 : newSize / fixed;
}

export function stretchPoint(p: Point, size: Size, target: Size, stretch?: Stretch): Point {
  return { x: stretchAxis(p.x, size.w, target.w, stretch?.x), y: stretchAxis(p.y, size.h, target.h, stretch?.y) };
}

const round = (n: number): number => Math.round(n * 1000) / 1000;

/** The size a shape takes in `target`: the whole box, or the largest box of the shape's own ratio when `keepAspect`. */
export function targetBox(size: Size, target: Size, keepAspect: boolean): Size {
  if (!keepAspect) return target;
  const s = Math.min(target.w / size.w, target.h / size.h);
  return { w: round(size.w * s), h: round(size.h * s) };
}

const num = (el: SvgEl, name: string): number => Number(el.attrs[name] ?? 0);
const fmt = (n: number): string => String(round(n));

function mapPath(d: string, map: (p: Point) => Point, size: Size, target: Size, stretch?: Stretch): string {
  const x = (v: number): number => stretchAxis(v, size.w, target.w, stretch?.x);
  const y = (v: number): number => stretchAxis(v, size.h, target.h, stretch?.y);
  const segments: PathSegment[] = parsePath(d).map(({ cmd, args }) => {
    if (cmd === "H") return { cmd, args: [x(args[0] ?? 0)] };
    if (cmd === "V") return { cmd, args: [y(args[0] ?? 0)] };
    const out: number[] = [];
    for (let i = 0; i < args.length; i += 2) {
      const p = map({ x: args[i] ?? 0, y: args[i + 1] ?? 0 });
      out.push(p.x, p.y);
    }
    return { cmd, args: out };
  });
  return formatPath(segments);
}

function stretchEl(el: SvgEl, size: Size, target: Size, stretch?: Stretch): SvgEl {
  const map = (p: Point): Point => stretchPoint(p, size, target, stretch);
  const x = (v: number): number => stretchAxis(v, size.w, target.w, stretch?.x);
  const y = (v: number): number => stretchAxis(v, size.h, target.h, stretch?.y);
  const children = el.children.map((c) => stretchEl(c, size, target, stretch));
  const attrs = { ...el.attrs };
  let tag = el.tag;
  if (tag === "path") attrs["d"] = mapPath(attrs["d"] ?? "", map, size, target, stretch);
  else if (tag === "polygon" || tag === "polyline") {
    attrs["points"] = (attrs["points"] ?? "")
      .trim()
      .split(/\s+/)
      .filter((s) => s !== "")
      .map((pair) => {
        const [px, py] = pair.split(",").map(Number);
        const p = map({ x: px ?? 0, y: py ?? 0 });
        return `${fmt(p.x)},${fmt(p.y)}`;
      })
      .join(" ");
  } else if (tag === "line") {
    const a = map({ x: num(el, "x1"), y: num(el, "y1") });
    const b = map({ x: num(el, "x2"), y: num(el, "y2") });
    Object.assign(attrs, { x1: fmt(a.x), y1: fmt(a.y), x2: fmt(b.x), y2: fmt(b.y) });
  } else if (tag === "rect") {
    const x0 = x(num(el, "x"));
    const y0 = y(num(el, "y"));
    Object.assign(attrs, {
      x: fmt(x0),
      y: fmt(y0),
      width: fmt(x(num(el, "x") + num(el, "width")) - x0),
      height: fmt(y(num(el, "y") + num(el, "height")) - y0),
    });
  } else if (tag === "circle" || tag === "ellipse") {
    const cx = num(el, "cx");
    const cy = num(el, "cy");
    const rx = tag === "circle" ? num(el, "r") : num(el, "rx");
    const ry = tag === "circle" ? num(el, "r") : num(el, "ry");
    tag = "ellipse";
    delete attrs["r"];
    Object.assign(attrs, {
      cx: fmt(x(cx)),
      cy: fmt(y(cy)),
      rx: fmt(rx * axisScale(cx, size.w, target.w, stretch?.x)),
      ry: fmt(ry * axisScale(cy, size.h, target.h, stretch?.y)),
    });
  }
  return { tag, attrs, children };
}

/** The shape's SVG redrawn at `target`: every coordinate stretched, the viewBox set to the target. */
export function stretchSvg(root: SvgEl, size: Size, target: Size, stretch?: Stretch): SvgEl {
  return {
    tag: root.tag,
    attrs: { ...root.attrs, viewBox: `0 0 ${fmt(target.w)} ${fmt(target.h)}` },
    children: root.children.map((c) => stretchEl(c, size, target, stretch)),
  };
}
