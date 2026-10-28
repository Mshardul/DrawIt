// Opening, editing state and saving of one diagram file. No DOM: `shell.ts` draws it.
import { History } from "../commands/history.ts";
import { KdlSyntaxError, readDiagram } from "../kdl/read.ts";
import { writeDiagram } from "../kdl/write.ts";
import type { DiagramDocument } from "../model/index.ts";
import { placeUnplaced } from "../render/place.ts";
import { type StorageAdapter, writeText } from "../storage/adapter.ts";
import type { TextMeasurer } from "../text/measure.ts";

/** DrawIt's own files. */
export const FILE_EXTENSION = ".drawit.kdl";

/** The diagram files in the opened folder, in the server's order. */
export async function workspaceFiles(storage: StorageAdapter): Promise<string[]> {
  return (await storage.list()).map((f) => f.path).filter((p) => p.endsWith(FILE_EXTENSION));
}

/** A diagram file open for editing. */
export class OpenFile {
  readonly path: string;
  readonly history: History;
  /** The canonical text of the document as last opened or saved. */
  private savedText: string;

  constructor(path: string, document: DiagramDocument) {
    this.path = path;
    this.history = new History(document);
    this.savedText = writeDiagram(document);
  }

  get document(): DiagramDocument {
    return this.history.document;
  }

  /** True when the document would save as different bytes than were last opened or saved. */
  get dirty(): boolean {
    return writeDiagram(this.history.document) !== this.savedText;
  }

  /** Writes the canonical form. Rejects, and stays dirty, if the storage fails. */
  async save(storage: StorageAdapter): Promise<void> {
    const text = writeDiagram(this.history.document);
    await writeText(storage, this.path, text);
    this.savedText = text;
  }
}

/** The file is not valid KDL. Nothing is open and nothing is written. */
export interface RefusedFile {
  path: string;
  message: string;
  /** Start at 1. */
  line: number;
  column: number;
}

export type OpenResult =
  | { ok: true; file: OpenFile; warnings: string[] }
  | { ok: false; path: string; error: RefusedFile };

/**
 * Reads and parses a file. A file that fails to parse is refused with its line and column and is
 * never opened, so it can never be saved over. Storage errors reject.
 */
export async function openFile(storage: StorageAdapter, path: string, measurer: TextMeasurer): Promise<OpenResult> {
  const text = new TextDecoder().decode(await storage.read(path));
  try {
    const { document, warnings } = readDiagram(text);
    return { ok: true, file: new OpenFile(path, placeUnplaced(document, measurer)), warnings };
  } catch (error) {
    if (error instanceof KdlSyntaxError) {
      return { ok: false, path, error: { path, message: error.message, line: error.line, column: error.column } };
    }
    throw error;
  }
}
