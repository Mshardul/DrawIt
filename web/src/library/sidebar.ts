// The shape library sidebar: a search box and the shapes by category. A preview is drawn by the
// renderer only when its entry scrolls into view. The sidebar keeps no state besides the search text
// and the armed shape it was told about.
import { mount } from "../render/mount.ts";
import type { PackLoader } from "../shapes/pack-loader.ts";
import type { TextMeasurer } from "../text/measure.ts";
import { groupByCategory, type LibraryEntry, libraryEntries, searchEntries } from "./entries.ts";
import { defaultSize, describePreview } from "./preview.ts";

export interface LibrarySidebarHost {
  loader: PackLoader;
  measurer: TextMeasurer;
  /** A shape was clicked. */
  onPick(entry: LibraryEntry): void;
}

export interface LibrarySidebar {
  element: HTMLElement;
  /** Marks the entry for `shape` as the armed one; null marks none. */
  setArmed(shape: string | null): void;
}

const SVG_NS = "http://www.w3.org/2000/svg";
/** The box every preview fits in, in px. */
const PREVIEW_W = 72;
const PREVIEW_H = 52;

export function createLibrarySidebar(host: LibrarySidebarHost): LibrarySidebar {
  const entries = libraryEntries(host.loader);
  const element = document.createElement("aside");
  element.className = "library";
  element.setAttribute("aria-label", "Shapes");
  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = "Search shapes";
  search.ariaLabel = "Search shapes";
  const list = document.createElement("div");
  element.append(search, list);
  let armed: string | null = null;

  const seen = new IntersectionObserver((changes) => {
    for (const change of changes) {
      if (!change.isIntersecting) continue;
      const svg = change.target;
      seen.unobserve(svg);
      const entry = entries.find((e) => e.shape === svg.getAttribute("data-shape"));
      if (entry) mount(svg, describePreview(entry, host.loader, host.measurer).nodes);
    }
  });

  const button = (entry: LibraryEntry): HTMLButtonElement => {
    const size = defaultSize(entry, host.loader);
    const preview = document.createElementNS(SVG_NS, "svg");
    preview.setAttribute("width", String(PREVIEW_W));
    preview.setAttribute("height", String(PREVIEW_H));
    preview.setAttribute("viewBox", `0 0 ${String(size.w)} ${String(size.h)}`);
    preview.setAttribute("aria-hidden", "true");
    preview.setAttribute("data-shape", entry.shape);
    const item = document.createElement("button");
    item.type = "button";
    item.className = "library-item";
    item.title = entry.name;
    item.dataset["shape"] = entry.shape;
    item.setAttribute("aria-pressed", String(entry.shape === armed));
    item.append(preview, entry.name);
    item.addEventListener("click", () => { host.onPick(entry); });
    seen.observe(preview);
    return item;
  };

  const render = (): void => {
    seen.disconnect();
    const groups = groupByCategory(searchEntries(entries, search.value));
    if (groups.length === 0) {
      const none = document.createElement("p");
      none.className = "library-empty";
      none.textContent = "No shapes match.";
      list.replaceChildren(none);
      return;
    }
    list.replaceChildren(
      ...groups.map(({ category, entries: group }) => {
        const section = document.createElement("section");
        const heading = document.createElement("h2");
        heading.textContent = category;
        const items = document.createElement("div");
        items.className = "library-items";
        items.append(...group.map(button));
        section.append(heading, items);
        return section;
      }),
    );
  };

  search.addEventListener("input", render);
  render();

  return {
    element,
    setArmed(shape) {
      armed = shape;
      for (const item of list.querySelectorAll<HTMLElement>(".library-item")) item.setAttribute("aria-pressed", String(item.dataset["shape"] === shape));
    },
  };
}
