const fs = require('fs');
const path = require('path');
const { parseCsvText, csvCell, csvRowsToText } = require('../shared/csv_utils');
const { normalizeName } = require('../shared/name_normalize');

function canonicalizeType(typeValue) {
  const typeLine = String(typeValue || '').trim();
  if (!typeLine) return '';

  if (/Creature/i.test(typeLine)) return 'Creature';
  if (/Land/i.test(typeLine)) return 'Land';
  if (/Planeswalker/i.test(typeLine)) return 'Planeswalker';
  if (/Battle/i.test(typeLine)) return 'Battle';
  if (/Artifact/i.test(typeLine)) return 'Artifact';
  if (/Enchantment/i.test(typeLine)) return 'Enchantment';
  if (/Instant/i.test(typeLine)) return 'Instant';
  if (/Sorcery/i.test(typeLine)) return 'Sorcery';

  return typeLine;
}

const collectionPath = path.join(__dirname, 'cardcollection.csv');
const formattedBatchPath = path.join(__dirname, '..', 'inputFiles', 'aa_fullinput_formatted_batch.csv');
const rawInputPath = path.join(__dirname, '..', 'inputFiles', 'aa_fullinput.csv');
const fallbackTypesPath = path.join(__dirname, 'cardtypes.csv');
const reportPath = path.join(__dirname, '..', 'outputs', 'batch_input_type_audit.csv');

if (!fs.existsSync(collectionPath)) {
  console.error('Missing', collectionPath);
  process.exit(1);
}
if (!fs.existsSync(formattedBatchPath)) {
  console.error('Missing', formattedBatchPath);
  process.exit(1);
}

const collectionRows = parseCsvText(fs.readFileSync(collectionPath, 'utf8'), { trim: false });
const batchRows = parseCsvText(fs.readFileSync(formattedBatchPath, 'utf8'), { trim: false });
const inputRows = fs.existsSync(rawInputPath)
  ? parseCsvText(fs.readFileSync(rawInputPath, 'utf8'), { trim: false })
  : [];
const fallbackRows = fs.existsSync(fallbackTypesPath)
  ? parseCsvText(fs.readFileSync(fallbackTypesPath, 'utf8'), { trim: false })
  : [];

const batchNames = [];
const seenBatchNames = new Set();
for (const row of batchRows) {
  const name = row[0] || '';
  const normalized = normalizeName(name);
  if (!normalized || seenBatchNames.has(normalized)) continue;
  seenBatchNames.add(normalized);
  batchNames.push({ normalized, name });
}

const inputTypeMap = new Map();
for (const row of inputRows) {
  const name = row[1] || row[0] || '';
  const normalized = normalizeName(name);
  const type = canonicalizeType(row[2] || '');
  if (!normalized || !type) continue;
  if (!inputTypeMap.has(normalized)) {
    inputTypeMap.set(normalized, type);
  }
}

const fallbackTypeMap = new Map();
for (let index = 1; index < fallbackRows.length; index++) {
  const row = fallbackRows[index];
  const normalized = normalizeName(row[0] || '');
  const type = canonicalizeType(row[1] || '');
  if (!normalized || !type || type.toLowerCase() === 'unknown') continue;
  if (!fallbackTypeMap.has(normalized)) {
    fallbackTypeMap.set(normalized, type);
  }
}

const collectionHeader = collectionRows[0] || ['name', 'type', 'set', 'number', 'rarity', 'status', 'copies'];
const updatedRows = [collectionHeader];
const reportRows = [['name', 'old_type', 'new_type', 'source', 'status']];
let updatedCount = 0;
let alreadyTypedCount = 0;
let unresolvedCount = 0;

for (let index = 1; index < collectionRows.length; index++) {
  const row = collectionRows[index];
  const name = row[0] || '';
  const normalized = normalizeName(name);
  const currentType = String(row[1] || '').trim();
  const inBatch = seenBatchNames.has(normalized);

  let nextType = currentType;
  let source = '';

  if (inBatch && (!currentType || currentType.toLowerCase() === 'unknown')) {
    if (inputTypeMap.has(normalized)) {
      nextType = inputTypeMap.get(normalized);
      source = 'aa_fullinput';
    } else if (fallbackTypeMap.has(normalized)) {
      nextType = fallbackTypeMap.get(normalized);
      source = 'cardtypes';
    }
  }

  updatedRows.push([row[0], nextType, ...row.slice(2)]);

  if (!inBatch) {
    continue;
  }

  if (currentType && currentType.toLowerCase() !== 'unknown') {
    alreadyTypedCount++;
    continue;
  }

  if (source) {
    updatedCount++;
    reportRows.push([name, currentType || '', nextType, source, 'updated']);
  } else {
    unresolvedCount++;
    reportRows.push([name, currentType || '', '', 'none', 'unresolved']);
  }
}

fs.writeFileSync(
  collectionPath,
  csvRowsToText(updatedRows),
  'utf8'
);

fs.writeFileSync(
  reportPath,
  csvRowsToText(reportRows),
  'utf8'
);

console.log(JSON.stringify({
  batchUniqueNames: batchNames.length,
  alreadyTypedCount,
  updatedCount,
  unresolvedCount,
  reportPath,
  collectionPath
}, null, 2));