import "./app/app.css";
import { startShell } from "./app/shell.ts";
import { HttpStorage } from "./storage/http.ts";
import { holdSession, resumeSession, SessionElsewhere, startSession } from "./storage/session.ts";

const app = document.getElementById("app");
if (app) {
  const token = startSession({ location, history, storage: sessionStorage });
  if (token === null) {
    app.textContent = "DrawIt: open the link the drawit server prints in the terminal.";
  } else {
    void openApp(app, token);
  }
}

async function openApp(root: HTMLElement, token: string): Promise<void> {
  try {
    const session = await resumeSession(token, sessionStorage);
    holdSession(token, session);
    const storage = new HttpStorage({ token, session });
    await storage.currentWorkspace();
    await startShell(root, storage);
  } catch (e: unknown) {
    root.textContent =
      e instanceof SessionElsewhere
        ? e.message
        : `DrawIt could not read the folder: ${e instanceof Error ? e.message : String(e)}`;
  }
}
