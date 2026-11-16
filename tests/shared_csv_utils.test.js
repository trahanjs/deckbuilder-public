const assert = require('node:assert/strict');
const { parseCsvText, csvRowsToText } = require('../shared/csv_utils');

const rows = [
  ['name', 'type'],
  ['Lightning Bolt', 'Instant'],
  ['Niv-Mizzet, Ghost Counsel', 'Creature']
];

const csvText = csvRowsToText(rows);
const parsed = parseCsvText(csvText, { trim: false });
assert.deepEqual(parsed, rows);

const withBlankLines = 'a,b\n\n"c,d",e\n';
const parsedWithBlank = parseCsvText(withBlankLines, { trim: false });
assert.deepEqual(parsedWithBlank, [['a', 'b'], ['c,d', 'e']]);

console.log('shared_csv_utils test passed');
