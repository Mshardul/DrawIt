import { KdlSyntaxError, readDiagram } from "../kdl/read.ts";
import { placeUnplaced } from "../render/place.ts";
import type { StorageAdapter, Unsubscribe } from "../storage/adapter.ts";
import { pollFile, type PollClock } from "../storage/poll.ts";
import type { TextMeasurer } from "../text/measure.ts";
import type { OpenFile } from "./workspace.ts";

export interface WatchOptions {
  measurer: TextMeasurer;
  /** Called after an outside change replaces the document. */
  onReload?: () => void;
  /** Called with the new bytes when they differ and the file has unsaved edits. The hash of the last read stays. */
  onConflict?: (text: string) => void;
  visible?: () => boolean;
  clock?: PollClock;
}

/** Reloads `text` as one undo step. Returns the parse error when `text` is not a diagram. */
export function replaceFromDisk(file: OpenFile, text: string, measurer: TextMeasurer): string | null {
  try {
    const document = readDiagram(text).document;
    file.reloadFromDisk(placeUnplaced(document, measurer), text);
    return null;
  } catch (error) {
    if (error instanceof KdlSyntaxError) return error.message;
    throw error;
  }
}

/** Polls an open file. A clean change reloads; unsaved edits are reported and left in place. */
export function watchChanges(file: OpenFile, storage: StorageAdapter, options: WatchOptions): Unsubscribe {
  return pollFile(
    storage,
    file.path,
    (text) => {
      if (file.matchesSaved(text)) {
        file.noteDisk(text);
        return;
      }
      if (file.dirty) {
        options.onConflict?.(text);
        return;
      }
      const reason = replaceFromDisk(file, text, options.measurer);
      if (reason !== null) {
        file.noteDisk(text);
        return;
      }
      options.onReload?.();
    },
    { baselineHash: file.diskHash(), visible: options.visible, clock: options.clock },
  );
}
