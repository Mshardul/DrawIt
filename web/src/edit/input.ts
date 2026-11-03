// Key input for editing commands on the selection: delete, duplicate, lock, select inside.
import { isTextEntry } from "../app/text-entry.ts";
import type { OpenFile } from "../app/workspace.ts";
import type { TextMeasurer } from "../text/measure.ts";
import { deleteCommand } from "./delete.ts";
import { duplicateCommand } from "./duplicate.ts";
import { toggleLockCommand } from "./lock.ts";
import { selectInside } from "./select-inside.ts";

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
    if (!file || isTextEntry(event.target)) return;
    if (event.altKey) return;
    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "d") {
      // The browser would bookmark the page.
      event.preventDefault();
      const copies = duplicateCommand(file.document, host.measurer, file.history.selection);
      if (!copies) return;
      file.history.execute(copies.command, { selection: copies.selection });
      host.refresh();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "a") {
      event.preventDefault();
      const inside = selectInside(file.document, host.measurer, file.history.selection);
      if (!inside) return;
      file.history.selection = inside;
      host.refresh();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "l") {
      event.preventDefault();
      const command = toggleLockCommand(file.document, file.history.selection);
      if (!command) return;
      file.history.execute(command);
      host.refresh();
      return;
    }
    if (event.metaKey || event.ctrlKey || (event.key !== "Delete" && event.key !== "Backspace")) return;
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
