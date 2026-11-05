# Cube and Deck Builder

A lightweight Magic: The Gathering deck-building and collection-analysis utility designed to turn a local card inventory and a commander/theme input file into usable deck and cube output data.

This project was built as a portfolio-ready example of a CSV-driven builder: it reads a collection, normalizes names, applies commander and theme rules, and writes output files that can be reviewed or used as a starting point for deck construction.

## What it does

The builder takes a set of card data and produces structured output for a few common planning workflows:

- analyze a local collection against a selected commander or theme
- prioritize cards by deck fit, commander synergy, and theme balance
- generate a combined deck output CSV
- produce a deduplicated cube-style output CSV for further review

The project is intentionally focused on the logic and workflow rather than a full user interface or external service integration.

## Why this exists

This is useful for players who want to:

- review a collection through a themed or commander-focused lens
- generate draft-ready deck ideas from a local CSV
- experiment with deck-building logic before turning it into a larger application
- keep the workflow fast, local, and easy to inspect in plain CSV format

## How it works

The project reads two main inputs:

1. a collection CSV in `cardDataBase/`
2. a formatted batch input file in `inputFiles/`

It then:

- normalizes card names to reduce mismatch issues
- loads commander and theme configuration from the builder config
- scores cards by inclusion priority and collection availability
- writes the generated output files to the `outputs/` folder

## Repository structure

```text
.
├── cubeAndDeckBuilder          # main entry point
├── builderConfig.js           # deck/theme configuration
├── services/                  # build logic and CSV processing
├── shared/                   # shared utility helpers
├── cardDataBase/             # sample collection data
├── inputFiles/               # sample build inputs
├── outputs/                  # generated CSV outputs
├── package.json              # runtime dependencies and scripts
├── .env.example             # optional runtime overrides
├── .gitignore               # repo hygiene
├── LICENSE                  # MIT license
└── README.md                # project overview
```

## Getting started

### Prerequisites

- Node.js 18+ recommended
- npm

### Install

```bash
npm install
```

### Run the builder

```bash
npm run build:decks
```

This executes the project entry point and generates output files in the `outputs/` directory.

## Sample data

This public version intentionally includes small, self-contained sample data instead of a real personal collection. That keeps the project easy to run, safe to share publicly, and useful as a demonstration without exposing private inventory data.

If you want to use it with your own cards, replace the CSVs in:

- `cardDataBase/cardcollection.csv`
- `inputFiles/aa_fullinput_formatted_batch.csv`

## Outputs

The build writes CSV files such as:

- `outputs/combinedDeckOutput.csv`
- `outputs/cubeOutput_deduped.csv`

These files are intended to be reviewed by hand and used as a starting point for deck planning, cube drafting, or further automation.

## Optional configuration

The project supports a small set of optional runtime overrides through environment variables. See `.env.example` for the available settings.

Example:

```bash
DECK_GROUP=some_group
DECK_COMMANDER=some_commander
```

These values are optional and the default sample configuration will work for a quick run.

## Notes

- This is a local, CSV-first project rather than a full web application.
- The builder is designed for experimentation and portfolio presentation.
- The sample dataset is intentionally limited, so output may look less complete than a full personal collection build.

## License

This project is licensed under the MIT License.

## A quick example workflow

```bash
npm install
npm run build:decks
```

Then review the generated CSVs in `outputs/` to inspect the build result and iterate on the input data.
