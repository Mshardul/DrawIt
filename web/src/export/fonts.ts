import type { DiagramDocument } from "../model/index.ts";
import { textLookFor } from "../style/of.ts";
import { FONT_FACES, type FontFaceSpec } from "../text/fonts.ts";

export interface EmbeddedFont {
  family: string;
  weight: number;
  italic: boolean;
  unicodeRange: string;
  base64: string;
}

export function usedFontFaces(doc: DiagramDocument, ids?: ReadonlySet<string>): FontFaceSpec[] {
  const wanted = new Set<string>();
  for (const element of doc.elements) {
    if (ids && !ids.has(element.id)) continue;
    const { family, weight, italic } = textLookFor(doc, element).style;
    wanted.add(`${family}\0${String(weight)}\0${String(italic)}`);
  }
  return FONT_FACES.filter((face) => wanted.has(`${face.family}\0${String(face.weight)}\0${String(face.italic)}`));
}

export function bytesToBase64(bytes: Uint8Array): string {
  const chunk = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunk) binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  return btoa(binary);
}

export async function embeddedFonts(
  doc: DiagramDocument,
  ids: ReadonlySet<string> | undefined,
  read: (url: string) => Promise<Uint8Array>,
): Promise<EmbeddedFont[]> {
  return Promise.all(
    usedFontFaces(doc, ids).map(async (face) => ({
      family: face.family,
      weight: face.weight,
      italic: face.italic,
      unicodeRange: face.unicodeRange,
      base64: bytesToBase64(await read(face.url)),
    })),
  );
}

export function fontFaceCss(faces: readonly EmbeddedFont[]): string {
  return faces
    .map(
      (face) =>
        `@font-face{font-family:'${face.family}';font-weight:${String(face.weight)};font-style:${face.italic ? "italic" : "normal"};src:url('data:font/woff2;base64,${face.base64}') format('woff2');unicode-range:${face.unicodeRange};}`,
    )
    .join("");
}

