# Cube and Deck Builder

A lightweight Magic: The Gathering deck-building and collection-analysis utility designed to turn a local card inventory and a commander/theme input file into usable deck and cube output data. The project is built to support both a terminal-first workflow and a browser-based interface, so the underlying build logic can be used either from the command line or through a small web app.

## What it does

The builder takes a set of card data and produces structured output for a few common planning workflows:

- analyze a local collection against a selected commander or theme
- prioritize cards by deck fit, commander synergy, and theme balance
- generate a combined deck output CSV
- produce a deduplicated cube-style output CSV for further review
- surface the same workflow through a simple web UI in addition to the terminal pipeline

The project is intentionally focused on the underlying logic and workflow while also supporting a user-facing layer for easier interaction.

## Why this exists

This is useful for players who want to:

- review a collection through a themed or commander-focused lens
- generate draft-ready deck ideas from a local CSV
- experiment with deck-building logic before turning it into a larger application
- keep the workflow fast, local, and easy to inspect in plain CSV format
- use the same project from either a quick terminal run or a browser-based experience

I also have some experience building with React, and that influence shows up in how I approach separating the data model, UI flows, and backend logic so the project can grow cleanly across both terminal and web experiences.

## How it works

The project reads two main inputs:

1. a collection CSV in `cardDataBase/`
2. a formatted batch input file in `inputFiles/`

It then:

- normalizes card names to reduce mismatch issues
- loads commander and theme configuration from the builder config
- scores cards by inclusion priority and collection availability
- writes the generated output files to the `outputs/` folder
- exposes the same logic to a web app under `web/` for browser-based interaction

## Repository structure

```text
.
├── cubeAndDeckBuilder.js        # main CLI entry point
├── builderConfig.js             # deck/theme configuration
├── services/                    # build logic and CSV processing
├── shared/                      # shared utility helpers
├── cardDataBase/                # sample collection data
├── inputFiles/                  # sample build inputs
├── outputs/                     # generated CSV outputs
├── web/                         # lightweight web app server and UI
│   ├── server.js                # Express app for browser-based access
│   ├── public/                  # static frontend assets
│   └── api/                     # API-related files and checks
├── package.json                 # root runtime dependencies and scripts
├── web/package.json             # web app dependencies and scripts
├── .env.example                 # optional runtime overrides
├── .gitignore                   # repo hygiene
├── LICENSE                      # MIT license
└── README.md                    # project overview
```

## Getting started

### Prerequisites

- Node.js 18+ recommended
- npm

### Install

```bash
npm install
```

### Run the builder from the terminal

```bash
npm run build:decks
```

This executes the project entry point and generates output files in the `outputs/` directory.

### Run the web app

From the project root:

```bash
cd web
npm install
npm start
```

Then open the app in the browser at `http://localhost:3000`.

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

- This project is designed to work both from the terminal and through a lightweight web app.
- The core builder logic remains local and CSV-first, while the web layer provides a more approachable interface for reviewing and interacting with the generated data.
- The sample dataset is intentionally limited, so output may look less complete than a full personal collection build.

## License

This project is licensed under the MIT License.

## A quick example workflow

```bash
npm install
npm run build:decks
```

Then review the generated CSVs in `outputs/` to inspect the build result and iterate on the input data. For the browser-based flow, run the web app from `web/` and use the local UI to explore the same configuration.
