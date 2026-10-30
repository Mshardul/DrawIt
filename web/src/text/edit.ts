// In-place text editing. A textarea sits over the element's text and shows the lines the renderer
// draws (see display.ts), so the caret and selection are where the drawn text will be. Every change
// goes through the command layer, grouped so a burst of typing is one undo step.
import type { OpenFile } from "../app/workspace.ts";
import type { Tool } from "../connectors/input.ts";
import type { DiagramDocument } from "../model/index.ts";
import type { ShapeLookup } from "../shapes/pack-loader.ts";
import { hitTest } from "../select/select.ts";
import { screenToWorld, type View } from "../view/view.ts";
import { applyDisplayEdit, displayIndex, editView, type EditView, modelIndex } from "./display.ts";
import type { TextLook } from "../style/text-look.ts";
import { fontShorthand, type TextMeasurer } from "./measure.ts";
import { createTextCommand, editTarget, type EditTarget, newTextId, setTextCommand } from "./target.ts";

export interface TextEditHost {
  /** The canvas; a double-click on it starts editing. */
  target: SVGSVGElement;
  /** Where the editor is put. */
  parent: HTMLElement;
  getView(): View;
  getFile(): OpenFile | null;
  measurer: TextMeasurer;
  /** Double-click edits only while the select tool is current. */
  getTool(): Tool;
  shapes?: ShapeLookup;
  /** The element whose text the renderer leaves out because the editor shows it, or null. */
  setEditing(id: string | null): void;
  /** Redraws after a change. `changed` lists the elements whose drawing differs. */
  refresh(changed?: ReadonlySet<string>): void;
}

export interface TextEdit {
  /** Puts the editor back over its text after the view moved. */
  reposition(): void;
  /** Ends editing, keeping the text typed so far. */
  close(): void;
  /** Removes the listeners. */
  detach(): void;
}

/** Gives the editor the font, colour, line height and alignment the text is drawn with. */
function applyLook(editor: HTMLTextAreaElement, look: TextLook): void {
  editor.style.font = fontShorthand(look.style);
  editor.style.lineHeight = `${String(look.lineHeight)}px`;
  editor.style.color = look.color;
  editor.style.textDecoration = look.underline ? "underline" : "none";
  editor.style.textAlign = look.align;
}

/** Room at the right of a line for the caret after its last character. */
const CARET_ROOM = 2;

interface Session {
  id: string;
  field: EditTarget["field"];
  editor: HTMLTextAreaElement;
  view: EditView;
  box: EditTarget["box"];
  look: EditTarget["look"];
  /** Typing in one session shares a group, so it merges into one undo step. */
  group: string;
  created: boolean;
  typed: boolean;
  composing: boolean;
}

/** Wires double-click editing to `host`. */
export function attachTextEdit(host: TextEditHost): TextEdit {
  let session: Session | null = null;
  let sessions = 0;
  const newGroup = (): string => `text-edit-${String(++sessions)}`;

  const targetOf = (doc: DiagramDocument, id: string): EditTarget | null => editTarget(doc, id, host.measurer, host.shapes);

  const reposition = (): void => {
    if (!session) return;
    const { editor, box, look } = session;
    const view = host.getView();
    const canvas = host.target.getBoundingClientRect();
    // The extra width keeps the caret visible after the last character without moving aligned text.
    const room = look.align === "center" ? CARET_ROOM / 2 : look.align === "right" ? CARET_ROOM : 0;
    editor.style.left = `${String(canvas.left + view.x + (box.x - room) * view.scale)}px`;
    editor.style.top = `${String(canvas.top + view.y + box.y * view.scale)}px`;
    editor.style.width = `${String(box.w + CARET_ROOM)}px`;
    editor.style.height = `${String(box.h)}px`;
    editor.style.transform = `scale(${String(view.scale)})`;
  };

  /** Shows the model's text in the editor, breaking lines as the renderer does, with the selection given in the text. */
  const show = (s: Session, doc: DiagramDocument, selection?: { start: number; end: number }): boolean => {
    const target = targetOf(doc, s.id);
    if (!target) return false;
    s.view = editView(target.text, target.lines);
    s.box = target.box;
    s.look = target.look;
    s.editor.value = s.view.display;
    s.editor.rows = target.lines.length;
    applyLook(s.editor, target.look);
    if (selection) s.editor.setSelectionRange(displayIndex(s.view.breaks, selection.start), displayIndex(s.view.breaks, selection.end));
    reposition();
    return true;
  };

  const modelSelection = (s: Session): { start: number; end: number } => ({
    start: modelIndex(s.view.breaks, s.editor.selectionStart),
    end: modelIndex(s.view.breaks, s.editor.selectionEnd),
  });

  const apply = (s: Session, file: OpenFile, value: string, selection: { start: number; end: number }, inputType: string): void => {
    const edit = applyDisplayEdit(s.view, value, selection, inputType);
    if (edit.text !== s.view.text) {
      file.history.execute(setTextCommand(s.field, s.id, edit.text), { group: s.group });
      s.typed = true;
    }
    show(s, file.document, edit.selection);
    host.refresh(new Set([s.id]));
  };

  const end = (): void => {
    const s = session;
    const file = host.getFile();
    if (!s) return;
    session = null;
    s.editor.remove();
    host.setEditing(null);
    const element = file?.document.elements.find((e) => e.id === s.id);
    if (file && element?.kind === "text" && element.content === "") {
      // A text box with no text is invisible, so it is not kept. One that was made and never typed in leaves no step.
      if (s.created && !s.typed) file.history.undo();
      else file.history.execute({ type: "delete", ids: [s.id] }, { selection: [], group: s.group });
    }
    host.refresh();
  };

  const begin = (file: OpenFile, id: string, created: boolean, group: string): void => {
    const target = targetOf(file.document, id);
    if (!target) return;
    end();
    const editor = document.createElement("textarea");
    editor.className = "text-edit";
    editor.wrap = "off";
    editor.spellcheck = false;
    editor.setAttribute("aria-label", "Edit text");
    const s: Session = {
      id,
      field: target.field,
      editor,
      view: editView(target.text, target.lines),
      box: target.box,
      look: target.look,
      group,
      created,
      typed: false,
      composing: false,
    };
    session = s;
    file.history.selection = [id];
    host.parent.append(editor);
    show(s, file.document);
    host.setEditing(id);
    host.refresh(new Set([id]));
    editor.focus();
    editor.select();

    editor.addEventListener("input", (event) => {
      const f = host.getFile();
      if (!f || s.composing) return;
      apply(s, f, editor.value, { start: editor.selectionStart, end: editor.selectionEnd }, event.inputType);
    });
    editor.addEventListener("compositionstart", () => {
      s.composing = true;
    });
    editor.addEventListener("compositionend", () => {
      s.composing = false;
      const f = host.getFile();
      if (f) apply(s, f, editor.value, { start: editor.selectionStart, end: editor.selectionEnd }, "insertCompositionText");
    });
    editor.addEventListener("keydown", (event) => {
      const f = host.getFile();
      if (event.key === "Escape" || ((event.metaKey || event.ctrlKey) && event.key === "Enter")) {
        event.preventDefault();
        end();
      } else if (f && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        // The browser's own undo would act on the display text, not on the document.
        event.preventDefault();
        s.group = newGroup();
        const moved = event.shiftKey ? f.history.redo() : f.history.undo();
        if (moved && !show(s, f.document, { start: Number.MAX_SAFE_INTEGER, end: Number.MAX_SAFE_INTEGER })) {
          // Undone past the element's own creation: nothing left to edit.
          session = null;
          editor.remove();
          host.setEditing(null);
        }
        host.refresh();
      }
    });
    editor.addEventListener("blur", () => {
      if (session === s) end();
    });
    const copy = (event: ClipboardEvent, cut: boolean): void => {
      const f = host.getFile();
      const { start, end: stop } = modelSelection(s);
      if (!f || start === stop) return;
      event.preventDefault();
      event.clipboardData?.setData("text/plain", s.view.text.slice(start, stop));
      if (cut) apply(s, f, s.view.display.slice(0, editor.selectionStart) + s.view.display.slice(editor.selectionEnd), { start: editor.selectionStart, end: editor.selectionStart }, "deleteByCut");
    };
    editor.addEventListener("copy", (event) => { copy(event, false); });
    editor.addEventListener("cut", (event) => { copy(event, true); });
  };

  const onDoubleClick = (event: MouseEvent): void => {
    const file = host.getFile();
    if (!file || event.button !== 0 || host.getTool() !== "select") return;
    const canvas = host.target.getBoundingClientRect();
    const at = screenToWorld(host.getView(), { x: event.clientX - canvas.left, y: event.clientY - canvas.top });
    const hit = hitTest(file.document, host.measurer, at, host.getView().scale);
    if (hit !== null) {
      begin(file, hit, false, newGroup());
      return;
    }
    const id = newTextId(file.document);
    const group = newGroup();
    file.history.execute(createTextCommand(file.document, at), { selection: [id], group });
    begin(file, id, true, group);
  };
  host.target.addEventListener("dblclick", onDoubleClick);

  return {
    reposition,
    close: end,
    detach: () => {
      end();
      host.target.removeEventListener("dblclick", onDoubleClick);
    },
  };
}
