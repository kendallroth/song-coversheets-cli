import fs from "node:fs";
import path from "node:path";

import type { PDFDocument, PDFFont, PDFPage, PDFPageDrawTextOptions } from "pdf-lib";
import type { SetRequired } from "type-fest";

import { FONTS_DIR } from "#assets/assets.constants";
import { splitTextEvenly } from "./text.util";

/** PDF units per inch (according to PDF spec) */
export const UNITS_TO_INCH = 72;

/** Convert inches to PDF units (at 1:72 ratio) */
export const inchesToUnits = (inches: number) => inches * UNITS_TO_INCH;

/** Load font into document from filesystem */
export const loadFont = async (document: PDFDocument, fontName: string): Promise<PDFFont> => {
  const fontPath = path.join(FONTS_DIR, fontName);

  let fontBytes: Buffer;
  try {
    fontBytes = fs.readFileSync(fontPath);
  } catch (e) {
    throw new Error(`Failed to load font '${fontName}' from '${fontPath}'`, { cause: e });
  }

  return document.embedFont(fontBytes);
};

/**
 * Draw centered text
 *
 * Will split text evenly into a new line if `spacing.maxWidth` is specified.
 */
export const drawTextCentered = (
  page: PDFPage,
  location: { y: number },
  text: string,
  fontOptions: SetRequired<PDFPageDrawTextOptions, "font" | "size">,
  spacing?: { lineSpacing?: number; maxWidth: number },
): { height: number; lines: number } => {
  const { width } = page.getSize();

  const initialWidth = fontOptions.font.widthOfTextAtSize(text, fontOptions.size);

  const textLines: string[] = [];

  const maxWidth = spacing?.maxWidth ?? Number.POSITIVE_INFINITY;
  if (initialWidth > maxWidth) {
    textLines.push(...splitTextEvenly(text));
  } else {
    textLines.push(text);
  }

  let drawLocationY = location.y;
  textLines.forEach((line, idx) => {
    drawLocationY = location.y - fontOptions.size * idx - (spacing?.lineSpacing ?? 0) * idx;

    page.drawText(line, {
      x: width / 2 - fontOptions.font.widthOfTextAtSize(line, fontOptions.size) / 2,
      y: drawLocationY,
      ...fontOptions,
    });
  });

  // Calculate total height so caller can position following elements correctly
  const totalHeight = location.y - drawLocationY;

  return { height: totalHeight, lines: textLines.length };
};

/** Set document metadata */
export const setDocumentMetadata = (
  document: PDFDocument,
  data: { title: string; author?: string },
) => {
  document.setTitle(data.title);
  document.setAuthor(data.author ?? "Kendall Roth");
};
