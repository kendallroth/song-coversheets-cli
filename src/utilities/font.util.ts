import fs from "node:fs";
import path from "node:path";

import type { PDFDocument, PDFFont } from "pdf-lib";

/** Load font into document from filesystem */
export const loadFont = async (document: PDFDocument, fontName: string): Promise<PDFFont> => {
  return document.embedFont(fs.readFileSync(path.join(__dirname, `../assets/fonts/${fontName}`)));
};