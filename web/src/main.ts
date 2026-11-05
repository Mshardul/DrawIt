import "./app/app.css";
import { showElsewhere } from "./app/elsewhere.ts";
import { firstScreen } from "./app/session.ts";
import { startShell } from "./app/shell.ts";
import { StorageError } from "./storage/adapter.ts";
import { HttpStorage } from "./storage/http.ts";
import { holdSession, rememberSession, resumeSession, SessionElsewhere, startSession } from "./storage/session.ts";

const app = document.getElementById("app");
if (app) {
  const token = startSession({ location, history, storage: sessionStorage });
  if (token === null) {
    app.textContent = "DrawIt: open the link the drawit server prints in the terminal.";
  } else {
    void openApp(app, token);
  }
}

function sessionEnded(error: unknown): boolean {
  return error instanceof SessionElsewhere || (error instanceof StorageError && (error.code === "session-lost" || error.code === "open-elsewhere"));
}

async function openApp(root: HTMLElement, token: string): Promise<void> {
  let stopHold = (): void => {};
  let editing: Promise<void> | null = null;
  let lost = (): void => {};
  const storage = new HttpStorage({
    token,
    session: sessionStorage.getItem("drawit.session") ?? "",
    onLost: () => {
      lost();
    },
  });
  const beginEditing = (): Promise<void> => {
    editing ??= (async () => {
      const info = await storage.currentWorkspace();
      await startShell(root, storage, { show: firstScreen(info.kind) });
    })().catch((error: unknown) => {
      editing = null;
      throw error;
    });
    return editing;
  };
  lost = () => {
    stopHold();
    showElsewhere(root, async () => {
      const id = await storage.takeoverSession();
      rememberSession(sessionStorage, id);
      stopHold = holdSession(token, id, fetch, () => {
        lost();
      });
      await beginEditing();
    });
  };
  try {
    const session = await resumeSession(token, sessionStorage);
    storage.useSession(session);
    stopHold = holdSession(token, session, fetch, () => {
      lost();
    });
    await beginEditing();
  } catch (e: unknown) {
    if (sessionEnded(e)) {
      lost();
      return;
    }
    if (root.querySelector(".elsewhere")) return;
    root.textContent = `DrawIt could not read the folder: ${e instanceof Error ? e.message : String(e)}`;
  }
}
