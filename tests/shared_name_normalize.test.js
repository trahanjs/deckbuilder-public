const assert = require('node:assert/strict');
const { normalizeName } = require('../shared/name_normalize');

assert.equal(normalizeName('  Teval  '), 'teval');
assert.equal(normalizeName('"Teval"'), 'teval');
assert.equal(normalizeName('Teval\u2014Name'), 'teval-name');
assert.equal(normalizeName('Teval\u2019s Card'), "teval's card");
assert.equal(
  normalizeName("'Quoted Name'", { stripSingleEdgeQuotes: true }),
  'quoted name'
);

console.log('shared_name_normalize test passed');
