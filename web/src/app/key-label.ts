import type { Action, ActionKey } from "./actions.ts";

const SYMBOLS: Record<string, string> = { "-": "−" };

/** A shortcut as the author reads it; the first chord stands for an action with several. */
export function keyLabel(key: NonNullable<Action["key"]>, mac: boolean): string {
  const chord: ActionKey | undefined = "key" in key ? key : key[0];
  if (!chord) return "";
  const name = SYMBOLS[chord.key] ?? chord.key.toUpperCase();
  const parts = mac
    ? [chord.alt && "⌥", chord.shift && "⇧", chord.mod && "⌘", name]
    : [chord.mod && "Ctrl", chord.alt && "Alt", chord.shift && "Shift", name];
  return parts.filter(Boolean).join(mac ? " " : "+");
}
