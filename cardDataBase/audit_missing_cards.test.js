const assert = require('node:assert/strict');
const { buildMissingAudit, writeMissingCardsList } = require('./audit_missing_cards.js');

const batchCsv = [
  'Card Name,Type,Price,Count,Percent,Commander',
  '"Niv-Mizzet, Ghost Counsel",,,141,21.75%,Betor',
  '"Llanowar Elves",,,120,15.00%,Teval',
  '"Lightning Bolt",,,99,20.00%,Miirym',
  '"Llanowar Elves",,,88,10.00%,Zurgo',
].join('\n');

const collectionCsv = [
  'Name,Type,Set,Number,Rarity,Status,Copies',
  '"Lightning Bolt",Instant,lea,1,common,own exact edition,1',
  '"Llanowar Elves",Creature,lea,2,common,own exact edition,1',
].join('\n');

const missing = buildMissingAudit(batchCsv, collectionCsv);
assert.equal(missing.length, 1);
assert.equal(missing[0].card_name, 'Niv-Mizzet, Ghost Counsel');
assert.equal(missing[0].example_commander, 'Betor');
assert.equal(missing[0].percent, '21.75%');
assert.deepEqual(missing[0].commanders, ['Betor']);

const output = writeMissingCardsList('tmp_missing_cards_output.txt', missing);
assert.equal(output, 'Niv-Mizzet, Ghost Counsel\n');
assert.equal(output.includes('"Niv-Mizzet, Ghost Counsel"'), false);

console.log('audit_missing_cards test passed');
