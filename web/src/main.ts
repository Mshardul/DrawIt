import "./app/app.css";
import { startShell } from "./app/shell.ts";
import { HttpStorage } from "./storage/http.ts";
import { startSession } from "./storage/session.ts";

const app = document.getElementById("app");
if (app) {
  const token = startSession({ location, history, storage: sessionStorage });
  if (token === null) {
    app.textContent = "DrawIt: open the link the drawit server prints in the terminal.";
  } else {
    startShell(app, new HttpStorage({ token })).catch((e: unknown) => {
      app.textContent = `DrawIt could not read the folder: ${e instanceof Error ? e.message : String(e)}`;
    });
  }
}
