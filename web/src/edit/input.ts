// Key input for editing commands on the selection.
import type { OpenFile } from "../app/workspace.ts";
import type { TextMeasurer } from "../text/measure.ts";
import { deleteCommand } from "./delete.ts";

export interface EditInputHost {
  getFile(): OpenFile | null;
  measurer: TextMeasurer;
  /** Redraw after the document or selection changed. */
  refresh(): void;
}

/** Wires editing keys to `host`. Returns a function that removes them. */
export function attachEditInput(host: EditInputHost): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    const file = host.getFile();
    const t = event.target;
    if (!file || t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) return;
    if (event.key !== "Delete" && event.key !== "Backspace") return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const command = deleteCommand(file.document, host.measurer, file.history.selection);
    if (!command) return;
    event.preventDefault();
    file.history.execute(command, { selection: [] });
    host.refresh();
  };
  addEventListener("keydown", onKeyDown);
  return () => {
    removeEventListener("keydown", onKeyDown);
  };
}
