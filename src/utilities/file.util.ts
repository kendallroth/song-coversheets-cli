import fs from "node:fs";

import chalk from "chalk";
import { parse as parseCsv } from "csv-parse/sync";
import type { AnySchema } from "yup";

/**
 * Load a text file
 *
 * @throws Error if reading file fails
 */
export const loadTextFile = (filePath: string, errorLog: "log" | "skip" = "skip"): string => {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch (e) {
    if (errorLog === "log") {
      console.error("Failed reading text file");
    }
    throw e;
  }
};

/**
 * Load and parse a CSV file (according to schema)
 *
 * @throws Error if reading or parsing file fails
 */
export const parseCsvFile = <T extends AnySchema>(
  filePath: string,
  schema: T,
  errorLog: "log" | "skip" = "skip",
) => {
  let fileCsvString: string;
  try {
    fileCsvString = loadTextFile(filePath);
  } catch (e) {
    if (errorLog === "log") {
      console.warn(chalk.yellow("Failed to load CSV file"));
    }
    throw e;
  }

  const fileRecords = parseCsv(fileCsvString, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  try {
    return schema.validateSync(fileRecords, { stripUnknown: true });
  } catch (e) {
    if (errorLog === "log") {
      console.warn(chalk.yellow("Failed to validate CSV file"));
    }
    throw e;
  }
};
