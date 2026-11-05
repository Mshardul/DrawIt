import { StorageError, type BrowseListing } from "../storage/adapter.ts";
import { openDialog } from "./dialog.ts";
import { askName } from "./create.ts";
import { browseCrumbs, folderNameCheck, importCheck } from "./files.ts";

export interface PickedEntry {
  kind: "folder" | "file";
  path: string;
}

/** Copies one diagram into a project. Import stays off until the file parses and a project is chosen. */
export function askImport(
  parent: HTMLElement,
  projects: readonly string[],
  save: (project: string, name: string, data: Uint8Array) => Promise<void>,
): Promise<boolean> {
  const zone = document.createElement("div");
  zone.className = "drop";
  const prompt = document.createElement("div");
  prompt.textContent = "Drop a .drawit.kdl file here";
  const or = document.createElement("div");
  or.className = "hint";
  or.textContent = "or";
  const choose = document.createElement("button");
  choose.type = "button";
  choose.className = "btn";
  choose.textContent = "Choose file…";
  const input = document.createElement("input");
  input.type = "file";
  input.className = "file";
  input.accept = ".drawit.kdl,text/plain";
  input.setAttribute("aria-label", "File");
  zone.append(prompt, or, choose, input);
  const into = document.createElement("div");
  into.className = "hint";
  into.textContent = "Into project";
  const select = document.createElement("select");
  select.className = "f";
  select.setAttribute("aria-label", "Project");
  for (const name of projects) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    select.append(option);
  }
  const err = document.createElement("div");
  err.className = "err";
  const body = document.createElement("div");
  body.append(zone, into, select, err);
  let project = projects[0] ?? "";
  let fileName = "";
  let bytes = new Uint8Array();
  let ready = false;
  let importButton: HTMLButtonElement | undefined;
  const sync = (): void => {
    if (importButton) importButton.disabled = !ready || project === "";
  };
  const take = async (file: File): Promise<void> => {
    fileName = file.name;
    bytes = new Uint8Array(await file.arrayBuffer());
    const result = importCheck(file.name, new TextDecoder().decode(bytes));
    prompt.textContent = file.name;
    ready = result.ok;
    err.textContent = result.ok ? "" : result.message;
    zone.classList.toggle("bad", !result.ok);
    sync();
  };
  choose.addEventListener("click", () => { input.click(); });
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) void take(file);
  });
  zone.addEventListener("dragover", (event) => { event.preventDefault(); });
  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    const file = event.dataTransfer?.files[0];
    if (file) void take(file);
  });
  select.addEventListener("change", () => {
    project = select.value;
    sync();
  });
  return openDialog(parent, {
    title: "Import a diagram",
    body,
    choices: [
      { label: "Cancel" },
      {
        label: "Import",
        kind: "primary",
        commit: async () => {
          if (!ready || project === "" || !importButton) return false;
          try {
            await save(project, fileName, bytes);
            return true;
          } catch (error) {
            err.textContent = error instanceof Error ? error.message : String(error);
            importButton.disabled = false;
            return false;
          }
        },
      },
    ],
    prepare(sheet) {
      importButton = [...sheet.querySelectorAll<HTMLButtonElement>(".ft button")].find((item) => item.textContent === "Import");
      sync();
    },
  }).then((answer) => answer === "Import");
}

function childPath(dir: string, name: string): string {
  return dir === "/" || dir === "" ? `/${name}` : `${dir}/${name}`;
}

/** Lists folders and diagrams from the home directory. Open returns the selected entry. */
export async function askBrowse(
  parent: HTMLElement,
  load: (path?: string) => Promise<BrowseListing>,
  makeFolder: (path: string, name: string) => Promise<string>,
): Promise<PickedEntry | null> {
  let current = await load();
  const home = current.path;
  let selected = "";
  let picked: PickedEntry | null = null;
  const crumbs = document.createElement("div");
  crumbs.className = "crumbs";
  const list = document.createElement("div");
  list.className = "browser-list";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", "Folder");
  const err = document.createElement("div");
  err.className = "err";
  const body = document.createElement("div");
  body.append(crumbs, list, err);
  let openButton: HTMLButtonElement | undefined;
  let pickedLabel: HTMLElement | undefined;
  const show = (): void => {
    const trail = browseCrumbs(home, current.path);
    const parts: Node[] = [];
    trail.forEach((crumb, index) => {
      if (index > 0) parts.push(document.createTextNode(" › "));
      if (index === trail.length - 1) {
        const here = document.createElement("b");
        here.textContent = crumb.label;
        parts.push(here);
        return;
      }
      const jump = document.createElement("button");
      jump.type = "button";
      jump.textContent = crumb.label;
      jump.addEventListener("click", () => { void go(crumb.path); });
      parts.push(jump);
    });
    const spacer = document.createElement("span");
    spacer.className = "sp";
    const add = document.createElement("button");
    add.type = "button";
    add.className = "add-row";
    add.textContent = "New folder";
    add.addEventListener("click", () => { void createHere(); });
    parts.push(spacer, add);
    crumbs.replaceChildren(...parts);
    list.replaceChildren(...current.entries.map((entry) => {
      const row = document.createElement("div");
      row.className = entry.name === selected ? "row on" : "row";
      const hit = document.createElement("button");
      hit.type = "button";
      hit.className = "hit";
      hit.textContent = entry.name;
      hit.setAttribute("role", "option");
      hit.setAttribute("aria-selected", entry.name === selected ? "true" : "false");
      hit.addEventListener("click", () => {
        selected = entry.name;
        show();
      });
      hit.addEventListener("dblclick", () => {
        if (entry.type === "folder") {
          void go(childPath(current.path, entry.name));
          return;
        }
        selected = entry.name;
        show();
        openButton?.click();
      });
      row.append(hit);
      if (entry.type === "folder") {
        const enter = document.createElement("button");
        enter.type = "button";
        enter.className = "go";
        enter.textContent = "›";
        enter.setAttribute("aria-label", `Enter ${entry.name}`);
        enter.addEventListener("click", () => { void go(childPath(current.path, entry.name)); });
        row.append(enter);
      }
      return row;
    }));
    if (pickedLabel) pickedLabel.textContent = selected === "" ? "" : `Selected: ${selected}`;
    if (openButton) openButton.disabled = selected === "";
  };
  const go = async (path?: string): Promise<void> => {
    try {
      current = await load(path);
      selected = "";
      err.textContent = "";
      show();
    } catch (error) {
      err.textContent = error instanceof Error ? error.message : String(error);
    }
  };
  const createHere = async (): Promise<void> => {
    const names = current.entries.map((entry) => entry.name);
    const name = await askName(parent, "New folder", (value) => folderNameCheck(value, names), async (value) => {
      try {
        await makeFolder(current.path, value);
      } catch (error) {
        if (error instanceof StorageError && error.code === "conflict") names.push(value);
        throw error;
      }
    });
    if (name === null) return;
    try {
      current = await load(current.path);
      selected = name;
      err.textContent = "";
      show();
    } catch (error) {
      err.textContent = error instanceof Error ? error.message : String(error);
    }
  };
  return openDialog(parent, {
    title: "Open a folder or a file",
    body,
    choices: [
      { label: "Cancel" },
      {
        label: "Open",
        kind: "primary",
        commit: () => {
          const entry = current.entries.find((item) => item.name === selected);
          if (!entry) return Promise.resolve(false);
          picked = { kind: entry.type, path: childPath(current.path, entry.name) };
          return Promise.resolve(true);
        },
      },
    ],
    prepare(sheet) {
      const foot = sheet.querySelector(".ft");
      pickedLabel = document.createElement("span");
      pickedLabel.className = "picked";
      foot?.prepend(pickedLabel);
      openButton = [...sheet.querySelectorAll<HTMLButtonElement>(".ft button")].find((item) => item.textContent === "Open");
      show();
    },
  }).then((answer) => (answer === "Open" ? picked : null));
}
