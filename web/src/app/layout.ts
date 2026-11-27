export const LAYOUT_PARTS = ["library", "properties", "toolbar", "status"] as const;

export type LayoutPart = (typeof LAYOUT_PARTS)[number];

export const PART_NAMES: Record<LayoutPart, string> = {
  library: "Library panel",
  properties: "Properties panel",
  toolbar: "Toolbar",
  status: "Status pill",
};

export interface Layout {
  shown(part: LayoutPart): boolean;
  setShown(part: LayoutPart, shown: boolean): void;
  /** Default panel widths and toolbar position. Visibility is unchanged. */
  reset(): void;
}
