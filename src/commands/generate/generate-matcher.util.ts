import path from "node:path";

import { input, Separator, search, select } from "@inquirer/prompts";
import chalk from "chalk";
import Fuse from "fuse.js";

import { formatPageRange, type LoadedPdf, parsePageRange } from "#utils/pdf.util";

/** Label for a song without a matched songsheet */
const NO_SONGSHEET_LABEL = "(no songsheet)";

/** Songsheet matched with a song */
export interface SongsheetMatch {
  file: LoadedPdf;
  /** Indices of pages to include (defaults to all pages) */
  pageIndices: number[];
}

/** Files to generate for a song */
export type SongOutput = "all" | "coversheet" | "combined" | "skip";

/** Reviewed song options */
export type ReviewedSong = {
  /** Undefined if no songsheet was found/matched */
  songsheetMatch?: SongsheetMatch;
  output: SongOutput;
};

/** Labels for choosing a song's output */
const SONG_OUTPUT_LABELS: Record<SongOutput, string> = {
  all: "Coversheet and combined",
  coversheet: "Coversheet only",
  combined: "Combined only",
  skip: "Skip song",
};

/** Labels for review list rows (default output is not indicated) */
const SONG_OUTPUT_ROW_LABELS: Partial<Record<SongOutput, string>> = {
  coversheet: "coversheet only",
  combined: "combined only",
};

/** Create fuzzy search over songsheet file names (without extensions) */
const createSongsheetSearch = (songsheets: LoadedPdf[]) => {
  const candidates = songsheets.map((file) => ({
    file,
    name: path.parse(file.fileName).name,
  }));

  return new Fuse(candidates, {
    ignoreLocation: true,
    includeScore: true,
    keys: ["name"],
    threshold: 0.4,
  });
};

// TODO: Reduce the dependency on input/output order between functions being the same (perhaps with shared type)

/**
 * Find closest songsheet for each song, using song title as the source of truth
 *
 * Songsheets are only used once. The closest song/file pairs are assigned first, preventing a weaker
 * title match from taking a file that fits another title better.
 *
 * @returns Matched songsheet (if any) for each song, in the same order as songs
 */
export const findSongsheetMatches = (
  songs: { title: string }[],
  songsheets: LoadedPdf[],
): (LoadedPdf | undefined)[] => {
  const songsheetSearch = createSongsheetSearch(songsheets);

  const pairs = songs
    .flatMap((song, songIndex) =>
      songsheetSearch.search(song.title).map((result) => ({
        file: result.item.file,
        score: result.score ?? 1,
        songIndex,
      })),
    )
    .sort((a, b) => a.score - b.score);

  const matches: (LoadedPdf | undefined)[] = songs.map(() => undefined);
  const usedFiles = new Set<LoadedPdf>();

  for (const { file, songIndex } of pairs) {
    if (matches[songIndex] || usedFiles.has(file)) continue;

    matches[songIndex] = file;
    usedFiles.add(file);
  }

  return matches;
};

/** Prompt for the songsheet to use for a song (sorted by fuzzy match) */
const promptForSongsheet = (
  songs: { title: string }[],
  songIndex: number,
  songsheets: LoadedPdf[],
  matches: (SongsheetMatch | undefined)[],
) => {
  const songsheetSearch = createSongsheetSearch(songsheets);

  return search<LoadedPdf | null>(
    {
      message: `Songsheet for "${songs[songIndex].title}"`,
      default: matches[songIndex]?.file ?? null,
      pageSize: 10,
      theme: {
        style: {
          description: chalk.yellow,
        },
      },
      source: (term) => {
        const toChoice = (file: LoadedPdf) => {
          const alreadyUsedByIdx = matches.findIndex((match) => match?.file === file);

          return {
            // Indicate songsheets already matched with another song
            description:
              alreadyUsedByIdx !== -1 && alreadyUsedByIdx !== songIndex
                ? `Currently used by "${songs[alreadyUsedByIdx].title}"`
                : undefined,
            name: file.fileName,
            value: file as LoadedPdf | null,
          };
        };

        const searchTerm = term?.trim();
        if (searchTerm) {
          return songsheetSearch.search(searchTerm).map((result) => toChoice(result.item.file));
        }

        // Include all songsheets (closest to song title first), as title search may exclude the desired file
        const rankedFiles = songsheetSearch.search(songs[songIndex].title).map((result) => result.item.file);
        const otherFiles = songsheets.filter((file) => !rankedFiles.includes(file));

        return [{ name: NO_SONGSHEET_LABEL, value: null }, ...[...rankedFiles, ...otherFiles].map(toChoice)];
      },
    },
    { clearPromptOnDone: true },
  );
};

/** Prompt for the pages to include from a matched songsheet */
const promptForPageRange = async ({ file, pageIndices }: SongsheetMatch): Promise<number[]> => {
  const pageRange = await input(
    {
      message: `Pages from "${file.fileName}" (${file.pages} pages):`,
      default: formatPageRange(pageIndices),
      prefill: "editable",
      validate: (value) => {
        try {
          parsePageRange(value, file.pages);
          return true;
        } catch (e) {
          return (e as Error).message;
        }
      },
    },
    { clearPromptOnDone: true },
  );

  return parsePageRange(pageRange, file.pages);
};

/**
 * Display matched songsheets and allow changing specific matches or their included pages
 *
 * Songsheets can only be used once; selecting one used by another song moves it to the selected song.
 *
 * @returns Reviewed songsheet (if any) and output for each song, in the same order as songs
 */
export const reviewSongsheetMatches = async (
  songs: { title: string }[],
  songsheets: LoadedPdf[],
  initialMatches: (LoadedPdf | undefined)[],
): Promise<ReviewedSong[]> => {
  const toMatch = (file: LoadedPdf): SongsheetMatch => ({
    file,
    pageIndices: file.document.getPageIndices(),
  });

  const songsheetMatches = initialMatches.map((file) => (file ? toMatch(file) : undefined));
  const songOutputs = songs.map((): SongOutput => "all");

  const titleWidth = Math.max(...songs.map((song) => song.title.length));

  type SongEditOptionIdx = number | "continue";
  /** Selected song option for editing (or "continue" to finish) */
  let activeSongEditOptionIdx: SongEditOptionIdx = "continue";
  while (true) {
    const songChoices = songs.map((song, songIndex) => {
      const songsheetMatch = songsheetMatches[songIndex];
      const output = songOutputs[songIndex];
      const title = song.title.padEnd(titleWidth);
      const outputLabel = SONG_OUTPUT_ROW_LABELS[output];

      if (output === "skip") {
        return { name: chalk.gray(`${title}  →  🚫 skipped`), value: songIndex as SongEditOptionIdx };
      }

      if (!songsheetMatch) {
        const noSongsheetLabel = outputLabel ? `(no songsheet, ${outputLabel})` : NO_SONGSHEET_LABEL;

        return {
          // Only highlight a missing songsheet if one is needed
          name:
            output === "coversheet"
              ? `${title}  →  ${chalk.gray(noSongsheetLabel)}`
              : chalk.yellow(`${title}  →  ${noSongsheetLabel}`),
          value: songIndex as SongEditOptionIdx,
        };
      }

      // Only indicate selected pages when some have been excluded
      const pagesLabel =
        songsheetMatch.pageIndices.length < songsheetMatch.file.pages
          ? `p. ${formatPageRange(songsheetMatch.pageIndices)} of ${songsheetMatch.file.pages}`
          : undefined;
      const rowLabels = [pagesLabel, outputLabel].filter(Boolean);

      return {
        name: `${title}  →  ${songsheetMatch.file.fileName}${rowLabels.length ? chalk.gray(` (${rowLabels.join(", ")})`) : ""}`,
        value: songIndex as SongEditOptionIdx,
      };
    });

    // Display songs and current matches for review (user can edit by selecting a song)
    activeSongEditOptionIdx = await select<SongEditOptionIdx>(
      {
        message: `Review songsheet matches ${chalk.gray("(select a song to change it)")}`,
        choices: [...songChoices, new Separator(), { name: "Continue", value: "continue" }],
        default: activeSongEditOptionIdx,
        // Display the entire list at once, with extra space as long rows may wrap in narrow terminals
        pageSize: (songChoices.length + 2) * 2,
      },
      { clearPromptOnDone: true },
    );

    if (activeSongEditOptionIdx === "continue") break;

    const songIndex: number = activeSongEditOptionIdx;
    const songsheetMatch = songsheetMatches[songIndex];

    const songEditAction = await select<"songsheet" | "pages" | "output" | "back">(
      {
        message: `"${songs[songIndex].title}"`,
        choices: [
          {
            name: `Change songsheet ${songsheetMatch ? chalk.gray(`(${songsheetMatch.file.fileName})`) : chalk.yellow(NO_SONGSHEET_LABEL)}`,
            value: "songsheet",
          },
          {
            name: songsheetMatch
              ? `Change pages ${chalk.gray(`(${formatPageRange(songsheetMatch.pageIndices)} of ${songsheetMatch.file.pages})`)}`
              : "Change pages",
            value: "pages",
            disabled: songsheetMatch ? false : NO_SONGSHEET_LABEL,
          },
          {
            name: `Change output ${chalk.gray(`(${SONG_OUTPUT_LABELS[songOutputs[songIndex]]})`)}`,
            value: "output",
          },
          { name: "Back", value: "back" },
        ],
      },
      { clearPromptOnDone: true },
    );

    if (songEditAction === "pages" && songsheetMatch) {
      songsheetMatch.pageIndices = await promptForPageRange(songsheetMatch);
    } else if (songEditAction === "output") {
      songOutputs[songIndex] = await select<SongOutput>(
        {
          message: `Output for "${songs[songIndex].title}"`,
          choices: (Object.keys(SONG_OUTPUT_LABELS) as SongOutput[]).map((output) => ({
            name: SONG_OUTPUT_LABELS[output],
            value: output,
          })),
          default: songOutputs[songIndex],
        },
        { clearPromptOnDone: true },
      );
    } else if (songEditAction === "songsheet") {
      const selectedFile = await promptForSongsheet(songs, songIndex, songsheets, songsheetMatches);

      // Selecting the current songsheet keeps its selected pages
      if ((selectedFile ?? undefined) === songsheetMatch?.file) continue;

      songsheetMatches.forEach((otherMatch, index) => {
        if (selectedFile && otherMatch?.file === selectedFile) {
          songsheetMatches[index] = undefined;
        }
      });
      songsheetMatches[songIndex] = selectedFile ? toMatch(selectedFile) : undefined;
    }
  }

  const matchedCount = songsheetMatches.filter(Boolean).length;
  console.log(`Matched ${matchedCount} of ${songs.length} songs to songsheets`);

  return songs.map((_, songIndex) => ({
    songsheetMatch: songsheetMatches[songIndex],
    output: songOutputs[songIndex],
  }));
};
