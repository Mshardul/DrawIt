const DIAGRAM = ".drawit.kdl";
const CHARACTERS = "Use letters, numbers, spaces, hyphens and underscores.";

export interface NameCheck {
  ok: boolean;
  message: string;
}

/** A project folder name: letters, numbers, spaces, hyphens and underscores, and not one that already exists. */
export function projectNameCheck(name: string, existing: readonly string[]): NameCheck {
  if (name === "") return { ok: false, message: "" };
  if (!allowedName(name, false)) return { ok: false, message: CHARACTERS };
  const found = existing.find((entry) => entry.toLowerCase() === name.toLowerCase());
  if (found !== undefined) return { ok: false, message: `A project named "${found}" already exists.` };
  return { ok: true, message: "" };
}

/** A diagram name in one folder. The extension is added, and a file already there is refused. */
export function diagramNameCheck(name: string, files: readonly string[], place: string): NameCheck {
  if (name === "") return { ok: false, message: "" };
  if (!allowedName(name, true)) return { ok: false, message: CHARACTERS };
  const file = `${name}${DIAGRAM}`;
  const found = files.find((entry) => entry.toLowerCase() === file.toLowerCase());
  if (found !== undefined) return { ok: false, message: `${found} already exists in ${place}.` };
  return { ok: true, message: "" };
}

function allowedName(name: string, diagram: boolean): boolean {
  if (name === "" || name.includes("/") || name.includes("\\")) return false;
  const bytes = new TextEncoder().encode(name).length + (diagram ? DIAGRAM.length : 0);
  if (bytes > 255) return false;
  for (const char of name) {
    if (char === " " || char === "-" || char === "_" || /\p{L}/u.test(char) || /\p{N}/u.test(char)) continue;
    return false;
  }
  return !windowsReserved(name);
}

function windowsReserved(name: string): boolean {
  const dot = name.indexOf(".");
  const base = (dot >= 0 ? name.slice(0, dot) : name).replace(/ +$/, "");
  const upper = base.toUpperCase();
  if (upper === "CON" || upper === "PRN" || upper === "AUX" || upper === "NUL") return true;
  if (base.length === 4) {
    const head = upper.slice(0, 3);
    const last = base[3] ?? "";
    if ((head === "COM" || head === "LPT") && last >= "1" && last <= "9") return true;
  }
  return false;
}
