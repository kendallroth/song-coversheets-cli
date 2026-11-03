import fs from "node:fs";
import path from "node:path";

import { PDFDocument, type PDFFont, type PDFPage, type PDFPageDrawTextOptions } from "pdf-lib";
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

/** PDF file loaded from the filesystem */
export type LoadedPdf = {
  document: PDFDocument;
  /** File name (including extension) */
  fileName: string;
  /** Page count */
  pages: number;
};

/**
 * Load all PDF files from a directory (non-recursive)
 *
 * @throws Error if reading directory or loading a file fails
 */
export const loadPdfsFromDirectory = async (directoryPath: string): Promise<LoadedPdf[]> => {
  const fileNames = fs
    .readdirSync(directoryPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === ".pdf")
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const pdfs: LoadedPdf[] = [];
  for (const fileName of fileNames) {
    try {
      const document = await PDFDocument.load(fs.readFileSync(path.join(directoryPath, fileName)));
      pdfs.push({ document, fileName, pages: document.getPageCount() });
    } catch (e) {
      throw new Error(`Failed to load PDF '${fileName}'`, { cause: e });
    }
  }

  return pdfs;
};

/** Append all pages from source document to the end of target document */
export const appendPdfPages = async (target: PDFDocument, source: PDFDocument) => {
  const pages = await target.copyPages(source, source.getPageIndices());
  for (const page of pages) {
    target.addPage(page);
  }
};

/**
 * Write a PDF file
 *
 * @param fileName - File name (without extension)
 * @throws Error if output directory does not exist or writing file fails
 */
export const writePdfDocument = async (document: PDFDocument, fileName: string, filePath: string) => {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isDirectory()) {
    throw new Error(`Output directory does not exist: ${filePath}`);
  }

  const pdfBytes = await document.save();
  const outputPath = path.join(filePath, `${fileName}.pdf`);
  fs.writeFileSync(outputPath, pdfBytes);
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
export const setDocumentMetadata = (document: PDFDocument, data: { title: string; author?: string }) => {
  document.setTitle(data.title);
  document.setAuthor(data.author ?? "Kendall Roth");
};
