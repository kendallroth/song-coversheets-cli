import path from "node:path";

/**
 * Absolute path to the assets directory
 *
 * NOTE: resolved relative to this file, so it is independent of caller location/cwd.
 */
export const ASSETS_DIR = import.meta.dirname;

/** Absolute path to the bundled fonts directory */
export const FONTS_DIR = path.join(ASSETS_DIR, "fonts");
