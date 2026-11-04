import { startShell, type Shell, type StartOptions } from "../app/shell.ts";
import { MemoryStorage } from "../storage/memory.ts";

export interface MountedShell {
  shell: Shell;
  storage: MemoryStorage;
}

/** Starts the shell over an in-memory folder. End-to-end specs call this from the page. */
export async function mountShell(files: Record<string, string | Uint8Array> = {}, options?: StartOptions): Promise<MountedShell> {
  const root = document.getElementById("app");
  if (!root) throw new Error("missing app root");
  const storage = new MemoryStorage(files);
  const shell = await startShell(root, storage, options);
  return { shell, storage };
}
