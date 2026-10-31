import fs from "node:fs";

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
