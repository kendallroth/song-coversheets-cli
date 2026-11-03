import path from "node:path";

import { Separator, search, select } from "@inquirer/prompts";
import chalk from "chalk";
import Fuse from "fuse.js";

import type { LoadedPdf } from "#utils/pdf.util";

/** Label for a song without a matched songsheet */
const NO_SONGSHEET_LABEL = "(no songsheet)";

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

/**
 * Display matched songsheets and allow changing specific matches
 *
 * Songsheets can only be used once; selecting one used by another song moves it to the selected song.
 *
 * @returns Reviewed songsheet (if any) for each song, in the same order as songs
 */
export const reviewSongsheetMatches = async (
  songs: { title: string }[],
  songsheets: LoadedPdf[],
  initialMatches: (LoadedPdf | undefined)[],
): Promise<(LoadedPdf | undefined)[]> => {
  const matches = [...initialMatches];
  const songsheetSearch = createSongsheetSearch(songsheets);
  const titleWidth = Math.max(...songs.map((song) => song.title.length));

  /** Selected song option for editing (or "continue" to finish) */
  let activeSongEditOptionIdx: number | "continue" = "continue";
  while (true) {
    const songChoices = songs.map((song, songIndex) => {
      const title = song.title.padEnd(titleWidth);
      const fileName = matches[songIndex]?.fileName;

      return {
        name: fileName ? `${title}  →  ${fileName}` : chalk.yellow(`${title}  →  ${NO_SONGSHEET_LABEL}`),
        value: songIndex as number | "continue",
      };
    });

    // Display songs and current matches for review (user can edit by selecting a song)
    activeSongEditOptionIdx = await select<number | "continue">(
      {
        message: `Review songsheet matches ${chalk.gray("(select a song to change it)")}`,
        choices: [...songChoices, new Separator(), { name: "Continue", value: "continue" }],
        default: activeSongEditOptionIdx,
        // Display the entire list at once (including separator and continue rows)
        pageSize: songs.length + 2,
      },
      { clearPromptOnDone: true },
    );

    if (activeSongEditOptionIdx === "continue") break;

    // Display search for changing the songsheet for the selected song (sorted by fuzzy match)
    const songIndex: number = activeSongEditOptionIdx;
    /** Selected songsheet option for the active song */
    const activeSongMatchOptionIdx = await search<LoadedPdf | null>(
      {
        message: `Songsheet for "${songs[songIndex].title}"`,
        default: matches[songIndex] ?? null,
        pageSize: 10,
        theme: {
          style: {
            description: chalk.yellow,
          },
        },
        source: (term) => {
          const toChoice = (file: LoadedPdf) => {
            const usedByIndex = matches.indexOf(file);

            return {
              // Indicate songsheets already matched with another song
              description:
                usedByIndex !== -1 && usedByIndex !== songIndex
                  ? `Currently used by "${songs[usedByIndex].title}"`
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
          const rankedFiles = songsheetSearch
            .search(songs[songIndex].title)
            .map((result) => result.item.file);
          const otherFiles = songsheets.filter((file) => !rankedFiles.includes(file));

          return [
            { name: NO_SONGSHEET_LABEL, value: null },
            ...[...rankedFiles, ...otherFiles].map(toChoice),
          ];
        },
      },
      { clearPromptOnDone: true },
    );

    matches.forEach((file, index) => {
      if (activeSongMatchOptionIdx && file === activeSongMatchOptionIdx) {
        matches[index] = undefined;
      }
    });
    matches[songIndex] = activeSongMatchOptionIdx ?? undefined;
  }

  const matchedCount = matches.filter(Boolean).length;
  console.log(`Matched ${matchedCount} of ${songs.length} songs to songsheets`);

  return matches;
};
