// Moving one end of an existing edge: onto an element, or off to a free point. Pure functions
// over the document.
import type { Command } from "../commands/command.ts";
import type { Anchor, DiagramDocument, Point } from "../model/index.ts";
import type { TextMeasurer } from "../text/measure.ts";
import { attachTargets } from "./draw.ts";
import { attachTarget } from "./routing.ts";

type EndName = "from" | "to";

const sameAnchor = (a: Anchor | undefined, b: Anchor): boolean =>
  typeof a === "object" && typeof b === "object" && a.side === b.side && (a.at ?? 0.5) === (b.at ?? 0.5);

/**
 * The command that moves the `end` of an edge to the world point `at`, or null when nothing would
 * change: an unknown or locked edge, a drop on the element at the other end (which would join an
 * element to itself) or an end that lands where it already is.
 *
 * A drop on an element writes the side and the position along it, never `auto`: placing an end by
 * hand is what the drag is for. A drop on anything else makes the end free, at the point rounded
 * to whole px. The edge keeps its ID even when it was the default `from->to`, so the style and
 * layout lines that name it still do; the writer adds an `id=` when the ends no longer match.
 */
export function reattachCommand(doc: DiagramDocument, measurer: TextMeasurer, edgeId: string, end: EndName, at: Point): Command | null {
  const edge = doc.elements.find((e) => e.id === edgeId);
  if (edge?.kind !== "edge") return null;
  const entry = doc.layout.find((e) => e.id === edgeId);
  if (entry?.locked === true) return null;

  const hit = attachTarget(attachTargets(doc, measurer), at);
  const other = edge[end === "from" ? "to" : "from"];
  if (hit && hit.id === other) return null;

  const pointKey = end === "from" ? "fromPoint" : "toPoint";
  if (hit) {
    if (edge[end] === hit.id && sameAnchor(entry?.[end], hit.anchor)) return null;
    return {
      type: "batch",
      commands: [
        { type: "setElement", id: edgeId, set: { [end]: hit.id } },
        { type: "setLayout", changes: [{ id: edgeId, set: { [end]: hit.anchor }, unset: [pointKey] }] },
      ],
    };
  }

  const point = { x: Math.round(at.x), y: Math.round(at.y) };
  const old = entry?.[pointKey];
  if (edge[end] === null && old?.x === point.x && old.y === point.y) return null;
  return {
    type: "batch",
    commands: [
      { type: "setElement", id: edgeId, set: { [end]: null } },
      { type: "setLayout", changes: [{ id: edgeId, set: { [pointKey]: point }, unset: [end] }] },
    ],
  };
}
