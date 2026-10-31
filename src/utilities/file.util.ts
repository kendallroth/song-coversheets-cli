import fs from "node:fs";

/**
 * Load a text file
 *
 * @throws Error if reading file fails
 */
export const loadTextFile = (filePath: string): string => {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch (e) {
    console.error("Failed reading text file");
    throw e;
  }
};
