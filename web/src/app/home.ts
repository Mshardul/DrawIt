import type { Preferences, TopEntry } from "../storage/adapter.ts";

const DIAGRAM = ".drawit.kdl";
const DAY = 86_400_000;

export interface ProjectCard {
  name: string;
  diagrams: string;
  /** Stem of the diagram that changed most recently. */
  latest?: string;
  /** Path of that diagram, so the card can draw it. */
  preview?: string;
  when: string;
}

export interface RecentCard {
  path: string;
  name: string;
  project: string;
}

export type HomeModel =
  | { kind: "first-run" }
  | { kind: "projects"; projects: ProjectCard[]; recent: RecentCard[] };

/** The start screen: a first run when the library has no projects, otherwise one card per project and the library's recent diagrams. */
export function homeModel(entries: readonly TopEntry[], preferences: Preferences, libraryPath: string, now: Date): HomeModel {
  const projects = entries.filter((entry) => entry.type === "folder").map((entry) => projectCard(entry, now));
  if (projects.length === 0) return { kind: "first-run" };
  return { kind: "projects", projects, recent: recentCards(preferences, libraryPath) };
}

function projectCard(entry: Extract<TopEntry, { type: "folder" }>, now: Date): ProjectCard {
  const card: ProjectCard = {
    name: entry.path,
    diagrams: entry.diagrams === 1 ? "1 diagram" : `${String(entry.diagrams)} diagrams`,
    when: editedWhen(entry.modified, now),
  };
  if (entry.latest) {
    card.latest = stem(entry.latest.path);
    card.preview = entry.latest.path;
  }
  return card;
}

function recentCards(preferences: Preferences, libraryPath: string): RecentCard[] {
  const recent = preferences["recent"];
  if (!isRecord(recent)) return [];
  const list = recent[libraryPath];
  if (!Array.isArray(list)) return [];
  const cards: RecentCard[] = [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    const slash = item.indexOf("/");
    if (slash <= 0 || item.indexOf("/", slash + 1) !== -1 || !item.endsWith(DIAGRAM)) continue;
    cards.push({ path: item, name: stem(item), project: item.slice(0, slash) });
  }
  return cards;
}

function stem(path: string): string {
  const file = path.slice(path.lastIndexOf("/") + 1);
  return file.endsWith(DIAGRAM) ? file.slice(0, -DIAGRAM.length) : file;
}

export function editedWhen(modified: string, now: Date): string {
  const then = new Date(modified);
  if (Number.isNaN(then.getTime())) return "";
  const diff = Math.round((day(now) - day(then)) / DAY);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff > 1 && diff < 7) return then.toLocaleDateString("en-US", { weekday: "short" });
  return then.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

function day(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
