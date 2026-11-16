const fs = require('fs');
const path = require('path');
const { parseCsvText } = require('../shared/csv_utils');
const { normalizeName: normalizeSharedName } = require('../shared/name_normalize');

function normalizeName(value) {
  return normalizeSharedName(value, {
    stripSingleEdgeQuotes: true
  });
}

function parseCSV(raw) {
  return parseCsvText(raw, { trim: false });
}

function buildMissingAudit(batchCsvText, collectionCsvText) {
  const batchRows = parseCSV(batchCsvText);
  const collectionRows = parseCSV(collectionCsvText);

  const collectionNames = new Set();
  for (const row of collectionRows) {
    const name = (row[0] || '').trim();
    if (!name) continue;
    collectionNames.add(normalizeName(name));
  }

  const missingByName = new Map();
  for (const row of batchRows) {
    if (!Array.isArray(row) || row.length < 6) continue;

    const rawName = (row[0] || '').trim();
    const normalized = normalizeName(rawName);
    if (!rawName || !normalized) continue;
    if (collectionNames.has(normalized)) continue;

    const commander = (row[5] || '').trim();
    const originalPercent = (row[4] || '').trim();
    const existing = missingByName.get(normalized) || {
      card_name: rawName,
      commanders: [],
      example_commander: '',
      percent: originalPercent,
      seen: 0,
    };

    if (commander && !existing.commanders.includes(commander)) {
      existing.commanders.push(commander);
    }
    if (!existing.example_commander && commander) {
      existing.example_commander = commander;
    }
    if (!existing.percent && originalPercent) {
      existing.percent = originalPercent;
    }
    existing.seen += 1;
    missingByName.set(normalized, existing);
  }

  return Array.from(missingByName.values())
    .map((entry) => ({
      ...entry,
      commanders: [...entry.commanders].sort(),
      percent: entry.percent || ''
    }))
    .sort((a, b) => a.card_name.localeCompare(b.card_name));
}

function writeMissingCardsList(reportPath, missingAudit) {
  const names = missingAudit.map((entry) => entry.card_name);
  const text = names.join('\n');
  const output = text ? `${text}\n` : '';
  fs.writeFileSync(reportPath, output, 'utf8');
  return output;
}

function main() {
  const rootDir = path.join(__dirname, '..');
  const batchPath = path.join(rootDir, 'inputFiles', 'aa_fullinput_formatted_batch.csv');
  const collectionPath = path.join(rootDir, 'cardDataBase', 'cardcollection.csv');
  const outputPath = path.join(rootDir, 'outputs', 'missing_cards_from_collection.csv');

  if (!fs.existsSync(batchPath)) {
    throw new Error(`Missing batch file: ${batchPath}`);
  }
  if (!fs.existsSync(collectionPath)) {
    throw new Error(`Missing collection file: ${collectionPath}`);
  }

  const batchCsvText = fs.readFileSync(batchPath, 'utf8');
  const collectionCsvText = fs.readFileSync(collectionPath, 'utf8');

  const missingAudit = buildMissingAudit(batchCsvText, collectionCsvText);
  const rawText = writeMissingCardsList(outputPath, missingAudit);

  console.log(JSON.stringify({
    outputPath,
    missingCount: missingAudit.length,
    sample: missingAudit.slice(0, 5).map((entry) => entry.card_name),
  }, null, 2));

  if (rawText) {
    console.log('\n--- preview ---');
    console.log(rawText.split('\n').slice(0, 10).join('\n'));
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  buildMissingAudit,
  normalizeName,
  parseCSV,
  writeMissingCardsList,
};
