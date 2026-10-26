// Per-file undo and redo (spec 5.5, decision A3): a session-only stack of Immer patches.
import type { DiagramDocument } from "../model/index.ts";
import { applyCommand, applyPatches } from "./command.ts";
import type { Command, Patch } from "./command.ts";

export interface HistoryOptions {
  /** Commands of one group closer together than this (ms) are one undo step. Default 1000. */
  pause?: number;
  /** Clock in ms; injected by tests. */
  now?: () => number;
}

export interface ExecuteOptions {
  /** The selection after the command. Unchanged when absent. */
  selection?: string[];
  /** Commands with the same group, such as typing in one text, merge into one step while the pause holds. */
  group?: string;
}

interface Step {
  patches: Patch[];
  inverse: Patch[];
  selectionBefore: string[];
  selectionAfter: string[];
  group?: string;
  at: number;
}

export class History {
  document: DiagramDocument;
  /** IDs of the selected elements. Undo and redo restore it. */
  selection: string[] = [];
  private undoStack: Step[] = [];
  private redoStack: Step[] = [];
  private readonly pause: number;
  private readonly now: () => number;

  constructor(document: DiagramDocument, options: HistoryOptions = {}) {
    this.document = document;
    this.pause = options.pause ?? 1000;
    this.now = options.now ?? Date.now;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Applies a command as one undo step, or merges it into the last step of the same group. Throws `CommandError` and changes nothing if it does not fit. */
  execute(command: Command, options: ExecuteOptions = {}): void {
    const { document, patches, inverse } = applyCommand(this.document, command);
    const at = this.now();
    const selectionBefore = this.selection;
    const selectionAfter = options.selection ?? this.selection;
    const last = this.undoStack.at(-1);
    const { group } = options;
    this.document = document;
    this.selection = selectionAfter;
    this.redoStack = [];
    if (last && group !== undefined && last.group === group && at - last.at <= this.pause) {
      last.patches = [...last.patches, ...patches];
      last.inverse = [...inverse, ...last.inverse];
      last.selectionAfter = selectionAfter;
      last.at = at;
      return;
    }
    const step: Step = { patches, inverse, selectionBefore, selectionAfter, at };
    if (group !== undefined) step.group = group;
    this.undoStack.push(step);
  }

  undo(): boolean {
    const step = this.undoStack.pop();
    if (!step) return false;
    this.document = applyPatches(this.document, step.inverse);
    this.selection = step.selectionBefore;
    this.redoStack.push(step);
    return true;
  }

  redo(): boolean {
    const step = this.redoStack.pop();
    if (!step) return false;
    this.document = applyPatches(this.document, step.patches);
    this.selection = step.selectionAfter;
    this.undoStack.push(step);
    return true;
  }
}
