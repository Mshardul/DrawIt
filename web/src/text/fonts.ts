// The three bundled font families. Files are woff2 so the same bytes can be embedded in SVG export.
export const FONT_FAMILIES = ["Inter", "Source Serif 4", "JetBrains Mono"] as const;
export type FontFamily = (typeof FONT_FAMILIES)[number];

export type FontScript = "latin" | "greek" | "cyrillic";
export type FontWeight = 400 | 700;

export interface FontFaceSpec {
  family: FontFamily;
  weight: FontWeight;
  italic: boolean;
  script: FontScript;
  url: string;
  unicodeRange: string;
}

const PACKAGES: Record<FontFamily, string> = {
  Inter: "inter",
  "Source Serif 4": "source-serif-4",
  "JetBrains Mono": "jetbrains-mono",
};

// Each script is its own file, so a face covers only its range and the browser fetches the rest on demand.
const SCRIPT_RANGES: Record<FontScript, string> = {
  latin:
    "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
  greek: "U+0370-0377,U+037A-037F,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03FF",
  cyrillic: "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116",
};

const FILES = import.meta.glob<string>(
  "/node_modules/@fontsource/{inter,source-serif-4,jetbrains-mono}/files/*-{latin,greek,cyrillic}-{400,700}-{normal,italic}.woff2",
  { query: "?url", import: "default", eager: true },
);

function fileUrl(pkg: string, script: FontScript, weight: FontWeight, italic: boolean): string {
  const path = `/node_modules/@fontsource/${pkg}/files/${pkg}-${script}-${String(weight)}-${italic ? "italic" : "normal"}.woff2`;
  const url = FILES[path];
  if (url === undefined) throw new Error(`missing font file ${path}`);
  return url;
}

export const FONT_FACES: readonly FontFaceSpec[] = FONT_FAMILIES.flatMap((family) =>
  (Object.keys(SCRIPT_RANGES) as FontScript[]).flatMap((script) =>
    ([400, 700] as const).flatMap((weight) =>
      [false, true].map((italic) => ({
        family,
        weight,
        italic,
        script,
        url: fileUrl(PACKAGES[family], script, weight, italic),
        unicodeRange: SCRIPT_RANGES[script],
      })),
    ),
  ),
);

/**
 * Registers every bundled face and resolves once all are loaded. Text measured before this resolves
 * would use a fallback font, so the app waits for it before drawing.
 */
export async function loadFonts(set: FontFaceSet = document.fonts): Promise<void> {
  const faces = FONT_FACES.map((spec) => {
    const face = new FontFace(spec.family, `url(${spec.url}) format("woff2")`, {
      weight: String(spec.weight),
      style: spec.italic ? "italic" : "normal",
      unicodeRange: spec.unicodeRange,
      display: "block",
    });
    set.add(face);
    return face;
  });
  await Promise.all(faces.map((face) => face.load()));
}
