# Cube and Deck Builder Demo

A compact MtG collection sorter and prototype deck builder that reads a local collection CSV, scores cards by commander/theme fit, and writes deck/cube output files.

## Features

- Reads a local card collection and build input
- Groups cards by theme and commander priorities
- Produces deck output and deduplicated cube output CSVs
- Keeps the runtime focused on the builder logic instead of scraping or private data workflows

## Setup

1. Install dependencies:
   npm install
2. Run the builder:
   npm run build:decks
3. Outputs are written to the `outputs/` folder.

## Example usage

The included sample data is intentionally small and self-contained so the project can run without a personal collection.

```bash
npm install
npm run build:decks
```

## Screenshot

![Screenshot placeholder](https://via.placeholder.com/1200x700?text=Cube+and+Deck+Builder+Demo)

## Notes

- The project is designed for a public portfolio copy and uses sample data only.
- Optional runtime overrides can be supplied through environment variables such as `DECK_GROUP` and `DECK_COMMANDER`.
- See `.env.example` for the supported settings.
