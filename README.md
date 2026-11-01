# Song Coversheets

Generate song coversheets via a simple CLI

## Features

- CLI to generate song coversheets (from songs CSV)

## Usage

```bash
npx tsx src/cli.ts --help
npm run cli -- --help
```

### `generate-coversheets`

Generate song coversheets from input CSV (requires `title`, `composer` fields).

```
Arguments:
  coversheetCsv             CSV file with coversheet data

Options:
  --output-dir <outputDir>  Output directory for generated coversheets
  --group <group>           Group name (for coversheet footer)
  --year <year>             Year (for coversheet footer)
```

## Development

### Setup

- Install NodeJS (ideally via `nvm`)
- Install dependencies with `npm install`

### Tasks

- Add CLI layer (with prompts for coversheet data and songs)
- Support merging generate coversheet PDFs with original PDFs
