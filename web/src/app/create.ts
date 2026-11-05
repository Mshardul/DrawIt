import { StorageError } from "../storage/adapter.ts";
import { openDialog } from "./dialog.ts";
import { projectNameCheck, type NameCheck } from "./names.ts";

export interface NamePrompt {
  confirm?: string;
  initial?: string;
  hint?: (name: string) => string;
}

/** Asks for a name and leaves the dialog open when the name is refused. Returns the name that was accepted. */
export function askName(
  parent: HTMLElement,
  title: string,
  check: (name: string) => NameCheck,
  create: (name: string) => Promise<void>,
  prompt: NamePrompt = {},
): Promise<string | null> {
  const confirm = prompt.confirm ?? "Create";
  const field = document.createElement("input");
  field.type = "text";
  field.className = "f";
  field.autocomplete = "off";
  field.setAttribute("aria-label", "Name");
  if (prompt.initial !== undefined) field.value = prompt.initial;
  const err = document.createElement("div");
  err.className = "err";
  const hint = document.createElement("div");
  hint.className = "hint";
  const body = document.createElement("div");
  body.append(field);
  if (prompt.hint) body.append(hint);
  body.append(err);
  let created = "";
  let confirmButton: HTMLButtonElement | undefined;
  const show = (result: NameCheck): void => {
    err.textContent = result.message;
    field.classList.toggle("bad", result.message !== "");
    if (prompt.hint) hint.textContent = prompt.hint(field.value);
    if (confirmButton) confirmButton.disabled = !result.ok;
  };
  return openDialog(parent, {
    title,
    body,
    choices: [
      { label: "Cancel" },
      {
        label: confirm,
        kind: "primary",
        commit: async () => {
          const result = check(field.value);
          if (!result.ok) {
            show(result);
            return false;
          }
          try {
            await create(field.value);
            created = field.value;
            return true;
          } catch (error) {
            const again = check(field.value);
            if (again.ok) {
              err.textContent = error instanceof Error ? error.message : String(error);
              field.classList.add("bad");
              if (confirmButton) confirmButton.disabled = false;
            } else show(again);
            return false;
          }
        },
      },
    ],
    prepare(sheet) {
      confirmButton = [...sheet.querySelectorAll("button")].find((item) => item.textContent === confirm);
      field.addEventListener("input", () => { show(check(field.value)); });
      field.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" || !confirmButton || confirmButton.disabled) return;
        event.preventDefault();
        confirmButton.click();
      });
      show(check(field.value));
    },
  }).then((answer) => (answer === confirm ? created : null));
}

/** Picks a project for a diagram. A new project can be created before the move. */
export function askMove(
  parent: HTMLElement,
  diagram: string,
  destinations: readonly string[],
  existing: readonly string[],
  create: (name: string) => Promise<void>,
  move: (project: string) => Promise<void>,
): Promise<boolean> {
  const projects = [...destinations];
  const names = [...existing];
  let selected = projects[0] ?? "";
  const list = document.createElement("div");
  list.className = "options";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", "Project");
  const err = document.createElement("div");
  err.className = "err";
  let moveButton: HTMLButtonElement | undefined;
  const paint = (): void => {
    list.replaceChildren(...projects.map((name) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = name === selected ? "opt on" : "opt";
      option.textContent = name;
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", name === selected ? "true" : "false");
      option.addEventListener("click", () => {
        selected = name;
        paint();
      });
      return option;
    }));
    if (moveButton) moveButton.disabled = selected === "";
  };
  const add = document.createElement("button");
  add.type = "button";
  add.className = "add-row";
  add.textContent = "+ New project";
  add.addEventListener("click", () => {
    void askName(parent, "New project", (value) => projectNameCheck(value, names), async (value) => {
      try {
        await create(value);
      } catch (error) {
        if (error instanceof StorageError && error.code === "conflict") names.push(value);
        throw error;
      }
      names.push(value);
      projects.push(value);
      selected = value;
      paint();
    });
  });
  const body = document.createElement("div");
  body.append(list, add, err);
  paint();
  return openDialog(parent, {
    title: `Move "${diagram}" to a project`,
    body,
    choices: [
      { label: "Cancel" },
      {
        label: "Move",
        kind: "primary",
        commit: async () => {
          if (selected === "" || !moveButton) return false;
          try {
            await move(selected);
            return true;
          } catch (error) {
            err.textContent = error instanceof StorageError && error.code === "conflict"
              ? `${diagram}.drawit.kdl already exists in ${selected}.`
              : error instanceof Error ? error.message : String(error);
            moveButton.disabled = false;
            return false;
          }
        },
      },
    ],
    prepare(sheet) {
      moveButton = [...sheet.querySelectorAll("button")].find((item) => item.textContent === "Move");
      if (moveButton) moveButton.disabled = selected === "";
    },
  }).then((answer) => answer === "Move");
}
