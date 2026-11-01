import fs from "node:fs";
import path from "node:path";

import { input } from "@inquirer/prompts";
import fontkit from "@pdf-lib/fontkit";
import chalk from "chalk";
import { Argument, Command, Option } from "commander";
import { parse as parseCsv } from "csv-parse/sync";
import { LineCapStyle, PDFDocument, type PDFFont, type PDFPage } from "pdf-lib";

import type { Point } from "../../types/vector.types";
import { loadTextFile } from "../../utilities/file.util";
import { UNITS_TO_INCH, drawTextCentered, inchesToUnits, loadFont } from "../../utilities/pdf.util";
import {
  getAngleBetweenPoints,
  getDistanceBetweenPoints,
  getPointAlongAngle,
} from "../../utilities/vector.util";
import { type SongsheetCsvItem, songsheetCsvSchema } from "./schema";

export const generateCommand = new Command("generate-coversheets")
  .description("Generate song cover sheets")
  .addArgument(new Argument("<coversheetCsv>", "CSV file with coversheet data"))
  .addOption(
    new Option(
      "--output-dir <outputDir>",
      "Output directory for generated coversheets",
    ).makeOptionMandatory(),
  )
  .addOption(new Option("--group <group>", "Group name (for coversheet footer)"))
  .addOption(new Option("--year <year>", "Year (for coversheet footer)"));

type CommandOptions = ReturnType<(typeof generateCommand)["opts"]>;

//////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Command handler
//////////////////////////////////////////////////////////////////////////////////////////////////////////////

generateCommand.action(async (coversheetCsv, options) => {
  let songs: SongsheetCsvItem[];
  try {
    songs = parseCsvFile(coversheetCsv);
  } catch (e) {
    return generateCommand.error("Could not load/parse CSV file");
  }

  let { group, year } = options;
  if (!group || !year) {
    console.log("Coversheet footer information");
    if (!group) {
      group = await input({ message: "Group name:", required: false });
    }
    if (!year) {
      year = await input({
        message: "Year:",
        required: false,
        default: new Date().getFullYear().toString(),
      });
    }
  }

  // Ensure output directory (and any parents) exists before writing files
  const outputDir = path.resolve(process.cwd(), options.outputDir);
  fs.mkdirSync(outputDir, { recursive: true });

  for (const song of songs) {
    await generateSongDocument(song, { outputDir, group, year });
  }

  console.log(`Generated ${songs.length} coversheets`);
  console.log(`Output to ${outputDir}`);
});

//////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Functions
//////////////////////////////////////////////////////////////////////////////////////////////////////////////

const MARGIN_SIZE = 0.5 * UNITS_TO_INCH;

/** NOTE: Errors are already logged */
const parseCsvFile = (filePath: string) => {
  let fileCsvString: string;
  try {
    fileCsvString = loadTextFile(filePath);
  } catch (e) {
    console.warn(chalk.yellow("Failed to load CSV file"));
    throw e;
  }

  const fileRecords = parseCsv(fileCsvString, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  try {
    return songsheetCsvSchema.validateSync(fileRecords, { stripUnknown: true });
  } catch (e) {
    console.warn(chalk.yellow("Failed to validate CSV file"));
    throw e;
  }
};

/** Generate individual coversheet PDF */
const generateSongDocument = async (
  song: SongsheetCsvItem,
  args: Pick<CommandOptions, "group" | "outputDir" | "year">,
) => {
  console.log(`Generating coversheet (${song.title})`);

  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const fontRegular = await loadFont(document, "Mulish-Regular.ttf");
  const fontItalic = await loadFont(document, "Mulish-Italic.ttf");
  const fontBold = await loadFont(document, "Mulish-Bold.ttf");

  const page = document.addPage([inchesToUnits(8.5), inchesToUnits(11)]);
  const { width, height } = page.getSize();

  drawBorders(page);

  const titleFontSize = 48;
  const titleLocationY = height - inchesToUnits(2.5);

  const maxTitleWidth = width - MARGIN_SIZE * 4;
  const { height: titleHeight } = drawTextCentered(
    page,
    { y: titleLocationY },
    song.title,
    { font: fontBold, size: titleFontSize },
    { lineSpacing: 10, maxWidth: maxTitleWidth },
  );

  const composerFontSize = 28;
  const composerLocationY = titleLocationY - titleHeight - inchesToUnits(0.5) - composerFontSize;

  drawTextCentered(page, { y: composerLocationY }, song.composer, {
    font: fontItalic,
    size: composerFontSize,
    opacity: 0.7,
  });

  generateFooter(page, args, { font: fontRegular });

  setDocumentMetadata(document, song);

  const pdfBytes = await document.save();
  const outputPath = path.join(args.outputDir, `${song.title} (Coversheet).pdf`);
  fs.writeFileSync(outputPath, pdfBytes);
};

/**
 * Draw borders around page
 *
 * - Thin line in a rectangle
 * - Thick line in a rectangle with decorated corners
 */
const drawBorders = (page: PDFPage) => {
  const { height, width } = page.getSize();

  /** Distance between thin border and page edge */
  const thinBorderMargin = inchesToUnits(0.75);
  const thinBorderPoints: Point[] = [
    { x: thinBorderMargin, y: height - thinBorderMargin },
    { x: width - thinBorderMargin, y: height - thinBorderMargin },
    { x: width - thinBorderMargin, y: thinBorderMargin },
    { x: thinBorderMargin, y: thinBorderMargin },
  ];

  thinBorderPoints.forEach((point, index, list) => {
    const nextPointIndex = index < list.length - 1 ? index + 1 : 0;
    const nextPoint = list[nextPointIndex];

    page.drawLine({
      start: point,
      end: nextPoint,
      thickness: 2,
      lineCap: LineCapStyle.Round,
    });
  });

  /** Distance that decoration line moves when stepping around in corners */
  const decorationStepDistance = 18;
  /**
   * Distance between thick decoration border and page edge
   *
   * NOTE: Must be equal to decoration step distance in order to properly align thin border in middle of decoration!
   */
  const thickBorderMargin = thinBorderMargin - decorationStepDistance / 2;
  const thickBorderPoints: Point[] = [
    { x: thickBorderMargin, y: height - thickBorderMargin },
    { x: width - thickBorderMargin, y: height - thickBorderMargin },
    { x: width - thickBorderMargin, y: thickBorderMargin },
    { x: thickBorderMargin, y: thickBorderMargin },
  ];

  thickBorderPoints.forEach((currentPoint, index, list) => {
    const nextPointIndex = index < list.length - 1 ? index + 1 : 0;
    const nextPoint = list[nextPointIndex];

    const decorationThickness = 4;

    let drawAngle = getAngleBetweenPoints(currentPoint, nextPoint);

    const distanceBetweenPoints = getDistanceBetweenPoints(currentPoint, nextPoint);
    /** Long page edge border should start where previous decoration (should have 😉) ended */
    const borderStartPoint = getPointAlongAngle(
      currentPoint,
      drawAngle,
      decorationStepDistance * 2,
    );
    /** Long page edge border should end where next decoration should start */
    const decorationStartPoint = getPointAlongAngle(
      currentPoint,
      drawAngle,
      distanceBetweenPoints - decorationStepDistance * 2,
    );

    // Draw page edge border leading from previous corner decoration to next corner decoration
    page.drawLine({
      start: borderStartPoint,
      end: decorationStartPoint,
      lineCap: LineCapStyle.Round,
      thickness: decorationThickness,
    });

    /**
     * Drawing movements required for corner decorations
     *
     * Corner decoration is a square that extends out past thinner border (centered around thin border point)
     */
    const decorationMovements: { angle: number; steps: number }[] = [
      { angle: -90, steps: 1 },
      { angle: 90, steps: 2 },
      { angle: 90, steps: 1 },
      { angle: 90, steps: 1 },
      { angle: 90, steps: 2 },
      { angle: 90, steps: 1 },
    ];

    let drawPoint = decorationStartPoint;
    // biome-ignore lint/complexity/noForEach: 'foreach' was used in case the index was required 🤷
    decorationMovements.forEach((movement) => {
      const startPoint = drawPoint;
      drawAngle += movement.angle;
      const nextPoint = getPointAlongAngle(
        drawPoint,
        drawAngle,
        movement.steps * decorationStepDistance,
      );
      drawPoint = nextPoint;

      page.drawLine({
        start: startPoint,
        end: nextPoint,
        lineCap: LineCapStyle.Round,
        thickness: decorationThickness,
      });
    });
  });
};

const generateFooter = (
  page: PDFPage,
  input: Pick<CommandOptions, "group" | "year">,
  args: { font: PDFFont },
) => {
  // NOTE: Calculate year location first (to properly place group above)

  const yearFontSize = 18;
  const yearLocationY = inchesToUnits(1.25);

  const groupFontSize = 28;
  const groupLocationY = yearLocationY + yearFontSize + inchesToUnits(0.25);

  if (input.group) {
    drawTextCentered(page, { y: groupLocationY }, input.group, {
      font: args.font,
      size: groupFontSize,
      opacity: 0.8,
    });
  }

  if (input.year) {
    drawTextCentered(page, { y: yearLocationY }, input.year.toString(), {
      font: args.font,
      size: yearFontSize,
      opacity: 0.6,
    });
  }
};

/** Set document metadata */
const setDocumentMetadata = (document: PDFDocument, song: SongsheetCsvItem) => {
  document.setTitle(song.title);
  document.setAuthor("Kendall Roth");
};
