import fs from "node:fs";
import path from "node:path";

import { input } from "@inquirer/prompts";
import chalk from "chalk";
import { Argument, Command, Option } from "commander";
import type { PDFDocument } from "pdf-lib";

import { parseCsvFile } from "#utils/file.util";
import {
  type LoadedPdf,
  UNITS_TO_INCH,
  loadPdfsFromDirectory,
  writePdfDocument,
} from "#utils/pdf.util";
import { generateCoversheet } from "./generate-coversheet.util";
import { findSongsheetMatches, reviewSongsheetMatches } from "./generate-matcher.util";
import { type SongsheetCsvItem, songsheetCsvSchema } from "./generate.schema";

export const MARGIN_SIZE = 0.5 * UNITS_TO_INCH;

export const generateCommand = new Command("generate-coversheets")
  .description("Generate song cover sheets")
  .addArgument(new Argument("<coversheetCsv>", "CSV file with coversheet data"))
  .addOption(
    new Option(
      "--output-dir <outputDir>",
      "Output directory for generated files",
    ).makeOptionMandatory(),
  )
  .addOption(new Option("--group <group>", "Group name (for coversheet footer)"))
  .addOption(new Option("--year <year>", "Year (for coversheet footer)"))
  .addOption(new Option("--songsheets-dir <songsheetDir>", "Input directory for songsheet files"))
  .addOption(
    new Option("--merged-suffix <suffix>", "File suffix for merged files").default("(combined)"),
  );

export type GenerateCommandOptions = ReturnType<(typeof generateCommand)["opts"]>;

//////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Command handler
//////////////////////////////////////////////////////////////////////////////////////////////////////////////

generateCommand.action(async (coversheetCsv, options) => {
  let coversheetInputs: SongsheetCsvItem[];
  try {
    coversheetInputs = parseCsvFile(coversheetCsv, songsheetCsvSchema, "log");
  } catch (e) {
    return generateCommand.error("Could not load/parse CSV file");
  }

  let songsheetFiles: LoadedPdf[] = [];
  if (options.songsheetsDir) {
    const songsheetsDir = path.resolve(process.cwd(), options.songsheetsDir);
    try {
      songsheetFiles = await loadPdfsFromDirectory(songsheetsDir);
    } catch (e) {
      console.error(chalk.red((e as Error).message));
      return generateCommand.error("Could not load songsheets");
    }
    if (!songsheetFiles.length) {
      return generateCommand.error("No songsheets loaded");
    }
    console.log(`Loaded ${songsheetFiles.length} songsheets`);
  }

  let { group, year } = options;
  if (!group || !year) {
    console.log("Coversheet footer information");
    if (!group) {
      group = await input({ message: "Group name:", required: false });
    }
    if (!year) {
      const currentYear = new Date().getFullYear().toString();
      year = await input({ message: "Year:", required: false, default: currentYear });
    }
  }
  group = group?.trim();
  year = year?.trim();

  // Find suggested songsheet file matches for coversheets (with option to change/review)
  let songsheetMatches: (LoadedPdf | undefined)[] = [];
  if (songsheetFiles.length) {
    const initialMatches = findSongsheetMatches(coversheetInputs, songsheetFiles);
    songsheetMatches = await reviewSongsheetMatches(
      coversheetInputs,
      songsheetFiles,
      initialMatches,
    );
  }

  // Ensure output directory (and any parents) exists before writing files
  const outputDir = path.resolve(process.cwd(), options.outputDir);
  fs.mkdirSync(outputDir, { recursive: true });

  /** Documents generated/matched for a song */
  interface SongDocuments {
    title: string;
    composer: string;
    coversheetPdf: PDFDocument;
    /** Undefined if no songsheet was found/matched */
    songsheetPdf?: PDFDocument;
  }
  const songDocuments: SongDocuments[] = [];
  for (const [songIndex, song] of coversheetInputs.entries()) {
    console.log(chalk.gray(` - Generating: ${song.title}`));
    const coversheetPdf = await generateCoversheet(song, { group, year });

    songDocuments.push({
      title: song.title,
      composer: song.composer,
      coversheetPdf,
      songsheetPdf: songsheetMatches[songIndex]?.document,
    });

    await writePdfDocument(coversheetPdf, song.title, outputDir);
  }

  console.log(`Generated ${coversheetInputs.length} coversheets`);
  console.log(`Output to ${outputDir}`);
});
