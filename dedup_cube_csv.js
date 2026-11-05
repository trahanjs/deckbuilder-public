'use strict';

const fs = require('fs');
const path = require('path');
const { parseCsvText } = require('./shared/csv_utils');
const { normalizeName } = require('./shared/name_normalize');
const { stringify } = require('csv-stringify/sync');

const inputFile = path.join(__dirname, 'outputs', 'combinedDeckOutput.csv');
const outputFile = path.join(__dirname, 'outputs', 'cubeOutput_deduped.csv');

function main() {
  const raw = fs.readFileSync(inputFile, 'utf8');
  const rows = parseCsvText(raw, {
    trim: false
  });

  if (rows.length === 0) {
    throw new Error(`No rows found in ${inputFile}`);
  }

  const [header, ...dataRows] = rows;
  const rowsByName = new Map();

  for (const row of dataRows) {
    if (!row || row.length === 0) continue;
    const name = String(row[0] || '').trim();
    if (!name) continue;

    if (!rowsByName.has(name)) {
      rowsByName.set(name, []);
    }
    rowsByName.get(name).push(row);
  }

  const consolidatedRows = [];

  for (const [name, groupedRows] of rowsByName.entries()) {
    const maybeboardValues = groupedRows.map((row) => [String(row[5] || ''), String(row[6] || '')]);
    const hasTrue = maybeboardValues.some(([maybeboard]) => maybeboard.toUpperCase() === 'TRUE');
    const hasFalse = maybeboardValues.some(([maybeboard]) => maybeboard.toUpperCase() === 'FALSE');

    if (hasTrue && hasFalse) {
      console.log(`WARNING: Maybeboard conflict for ${name}:`);
      for (const [maybeboard, tags] of maybeboardValues) {
        console.log(`  - Maybeboard: ${maybeboard}, Tags: ${tags}`);
      }
    }

    const allTags = new Set();
    for (const row of groupedRows) {
      const rawTags = String(row[6] || '');
      for (const tag of rawTags.split(';')) {
        const trimmedTag = tag.trim();
        if (trimmedTag) {
          allTags.add(trimmedTag);
        }
      }
    }

    const baseRow = groupedRows[0].slice();
    if (hasTrue && hasFalse) {
      baseRow[5] = 'FALSE';
    }
    baseRow[6] = Array.from(allTags).sort((left, right) => left.localeCompare(right)).join(';');
    consolidatedRows.push(baseRow);
  }

  consolidatedRows.sort((left, right) => normalizeName(left[0]).localeCompare(normalizeName(right[0])));
  fs.writeFileSync(outputFile, stringify([header, ...consolidatedRows]), 'utf8');
  console.log(`Deduplicated CSV written to ${outputFile}`);
}

main();