/** PDF units per inch (according to PDF spec) */
export const UNITS_TO_INCH = 72;

/** Convert inches to PDF units (at 1:72 ratio) */
export const inchesToUnits = (inches: number) => inches * UNITS_TO_INCH;
