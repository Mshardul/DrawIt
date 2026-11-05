import type { ImageStore } from "../images/store.ts";
import type { StorageAdapter, WorkspaceInfo, WorkspaceKind, WorkspaceTarget } from "../storage/adapter.ts";
import type { OpenFile } from "./workspace.ts";

export type OpeningScreen = "landing" | "home";

/** A project or an opened folder starts on its landing page. Anything else starts on Home. */
export function firstScreen(kind: WorkspaceKind): OpeningScreen {
  return kind === "project" || kind === "opened" ? "landing" : "home";
}

export interface EditorSession {
  readonly storage: StorageAdapter;
  readonly images: ImageStore;
  file: OpenFile | null;
  info: WorkspaceInfo;
}

/** Switches the open folder and records it so the next launch can return there. */
export async function enterWorkspace(session: EditorSession, target: WorkspaceTarget): Promise<void> {
  const info = await session.storage.openWorkspace(target);
  session.info = info;
  if (info.path === "") return;
  await session.storage.patchPreferences({ workspace: { folder: info.path } });
}
