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
  visible?: () => boolean;
  clock?: PollClock;
}

/** Polls an open file and reloads it when the bytes change and there are no unsaved edits. */
export function watchChanges(file: OpenFile, storage: StorageAdapter, options: WatchOptions): Unsubscribe {
  return pollFile(
    storage,
    file.path,
    (text) => {
      if (file.matchesSaved(text)) {
        file.noteDisk(text);
        return;
      }
      let document;
      try {
        document = readDiagram(text).document;
      } catch (error) {
        if (error instanceof KdlSyntaxError) {
          file.noteDisk(text);
          return;
        }
        throw error;
      }
      if (file.dirty) {
        file.noteDisk(text);
        return;
      }
      file.reloadFromDisk(placeUnplaced(document, options.measurer), text);
      options.onReload?.();
    },
    { baselineHash: file.diskHash(), visible: options.visible, clock: options.clock },
  );
}
