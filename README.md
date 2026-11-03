# Song Coversheets

Generate song coversheets via a simple CLI

## Features

- CLI to generate song coversheets (from songs CSV)
- CLI to combine generated song sheets with original songsheet PDFs

## Usage

```bash
npx tsx src/cli.ts --help
npm run cli -- --help
```

### `generate-coversheets`

Generate song coversheets from input CSV (requires `title`, `composer` fields) and combine with songsheet PDFs (with support for page ranges).

```
Arguments:
  coversheetCsv                    CSV file with coversheet data

Options:
  --output-dir <outputDir>         Output directory for generated files
  --group <group>                  Group name (for coversheet footer)
  --year <year>                    Year (for coversheet footer)
  --songsheets-dir <songsheetDir>  Input directory for songsheet files
  --merged-suffix <suffix>         File suffix for merged files (default: "(final)")
  --skip-all                       Start with all songs skipped (requires --songsheets-dir)
```

## Development

### Setup

- Install NodeJS (ideally via `nvm`)
- Install dependencies with `npm install`
