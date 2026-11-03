import fs from "node:fs";
import path from "node:path";

import { input } from "@inquirer/prompts";
import chalk from "chalk";
import { Argument, Command, Option } from "commander";

import { parseCsvFile } from "#utils/file.util";
import {
  type LoadedPdf,
  UNITS_TO_INCH,
  appendPdfPages,
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
    new Option("--output-dir <outputDir>", "Output directory for generated files").makeOptionMandatory(),
  )
  .addOption(new Option("--group <group>", "Group name (for coversheet footer)"))
  .addOption(new Option("--year <year>", "Year (for coversheet footer)"))
  .addOption(new Option("--songsheets-dir <songsheetDir>", "Input directory for songsheet files"))
  .addOption(new Option("--merged-suffix <suffix>", "File suffix for merged files").default("(combined)"));

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

  /** Songsheet files loaded from input directory (for matching/combinging with coversheets) */
  let inputSongsheets: LoadedPdf[] = [];
  if (options.songsheetsDir) {
    const songsheetsDir = path.resolve(process.cwd(), options.songsheetsDir);
    try {
      inputSongsheets = await loadPdfsFromDirectory(songsheetsDir);
    } catch (e) {
      console.error(chalk.red((e as Error).message));
      return generateCommand.error("Could not load songsheets");
    }
    if (!inputSongsheets.length) {
      return generateCommand.error("No songsheets loaded");
    }
    console.log(`Loaded ${inputSongsheets.length} songsheets`);
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
  if (inputSongsheets.length) {
    const initialMatches = findSongsheetMatches(coversheetInputs, inputSongsheets);
    songsheetMatches = await reviewSongsheetMatches(coversheetInputs, inputSongsheets, initialMatches);
  }

  // Ensure output directory (and any parents) exists before writing files
  const outputDir = path.resolve(process.cwd(), options.outputDir);
  fs.mkdirSync(outputDir, { recursive: true });

  let combinedCount = 0;
  for (const [songIndex, song] of coversheetInputs.entries()) {
    console.log(chalk.gray(` - Generating: ${song.title}`));

    const coversheetPdf = await generateCoversheet(song, { group, year });

    // NOTE: Coversheet must be written first, as appending songsheet pages modifies the document!
    await writePdfDocument(coversheetPdf, `${song.title} (coversheet)`, outputDir);

    const songsheetPdf = songsheetMatches[songIndex]?.document;
    if (songsheetPdf) {
      await appendPdfPages(coversheetPdf, songsheetPdf);
      await writePdfDocument(coversheetPdf, `${song.title} ${options.mergedSuffix.trim()}`, outputDir);
      combinedCount++;
    } else if (options.songsheetsDir) {
      console.warn(chalk.yellow("   - no songsheet"));
    }
  }

  let successMessage = `Generated ${coversheetInputs.length} coversheets`;
  if (inputSongsheets.length) {
    successMessage += ` and ${combinedCount} combined files`;
  }
  console.log(chalk.green(successMessage));
  console.log(chalk.gray(`Output to ${outputDir}`));
});
