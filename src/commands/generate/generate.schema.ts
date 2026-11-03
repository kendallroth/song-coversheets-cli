import * as yup from "yup";

export const songsheetCsvSchemaItem = yup.object({
  title: yup.string().required(),
  composer: yup.string().required(),
});

export const songsheetCsvSchema = yup.array().of(songsheetCsvSchemaItem).min(1).required();

export type SongsheetCsvItem = yup.InferType<typeof songsheetCsvSchemaItem>;
