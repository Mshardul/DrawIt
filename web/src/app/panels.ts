/** Narrowest and widest a panel drag may set, in px. */
export const PANEL_MIN = 180;
export const PANEL_MAX = 360;
/** The canvas keeps this width until both panels are as narrow as they can be. */
export const CANVAS_MIN = 480;
export const LIBRARY_WIDTH = 224;
export const PROPERTIES_WIDTH = 200;

export interface PanelWidths {
  library: number;
  properties: number;
  /** Stored for a later preference. The panel stays open. */
  libraryShown: boolean;
  propertiesShown: boolean;
}

function clampWidth(value: unknown, fallback: number): number {
  const width = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(PANEL_MAX, Math.max(PANEL_MIN, width));
}

/** The panels entry in the preferences file. Missing fields use the default width and stay shown. */
export function readPanels(value: unknown): PanelWidths {
  const record = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  return {
    library: clampWidth(record["library"], LIBRARY_WIDTH),
    properties: clampWidth(record["properties"], PROPERTIES_WIDTH),
    libraryShown: typeof record["libraryShown"] === "boolean" ? record["libraryShown"] : true,
    propertiesShown: typeof record["propertiesShown"] === "boolean" ? record["propertiesShown"] : true,
  };
}

/** Widths to draw. A narrow window shrinks the panels toward 180 before the canvas goes under 480. */
export function fitPanels(library: number, properties: number, windowWidth: number): { library: number; properties: number } {
  const lib = clampWidth(library, LIBRARY_WIDTH);
  const prop = clampWidth(properties, PROPERTIES_WIDTH);
  const overflow = lib + prop + CANVAS_MIN - windowWidth;
  if (overflow <= 0) return { library: lib, properties: prop };
  const roomL = lib - PANEL_MIN;
  const roomP = prop - PANEL_MIN;
  const room = roomL + roomP;
  if (room === 0 || overflow >= room) return { library: PANEL_MIN, properties: PANEL_MIN };
  const takeL = Math.round(overflow * roomL / room);
  return { library: lib - takeL, properties: prop - (overflow - takeL) };
}

/** The width a drag may set. Below the point where the canvas would lose its 480, the panel stays at 180. */
export function dragPanel(wanted: number, other: number, windowWidth: number): number {
  const ceiling = Math.min(PANEL_MAX, windowWidth - other - CANVAS_MIN);
  if (ceiling < PANEL_MIN) return PANEL_MIN;
  return Math.min(Math.max(clampWidth(wanted, PANEL_MIN), PANEL_MIN), ceiling);
}
