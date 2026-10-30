// Commands that change the style of a selection. Each is one command, so one undo step.
import type { Command } from "../commands/command.ts";
import type { StyleProps } from "../model/index.ts";

/** Sets properties on the override line of every element in `ids`. */
export function setStyle(ids: readonly string[], props: StyleProps): Command {
  return { type: "batch", commands: ids.map((id) => ({ type: "setStyle", target: { kind: "el", id }, set: props })) };
}

/** Removes properties from the override line of every element in `ids`, so each falls back to its class and the theme. */
export function clearStyle(ids: readonly string[], keys: readonly (keyof StyleProps)[]): Command {
  return { type: "batch", commands: ids.map((id) => ({ type: "setStyle", target: { kind: "el", id }, unset: [...keys] })) };
}
