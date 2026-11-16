const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const deckBuilderCoreService = require('../services/deckBuilderCoreService');

function testRunCardSelectionPhasesSmoke() {
  const context = {
    primeCardOutput: [],
    cardIndices: {
      command: 0,
      name: 1,
      type: 2,
      inclusion: 3,
      themeCount: 4,
      theme: 5,
      status: 6
    },
    COMMANDER_META: {},
    getCommanderTheme: () => null,
    selectedGroup: 'test_group',
    COMMANDER_SETS: { test_group: {} },
    LAND_INCLUSION_LIMIT: 0,
    sortByPriorityAndInclusion: () => [],
    cardThemeUsage: new Map(),
    cardProcessed: new Map(),
    getMaxCopies: () => 0,
    themeData: {},
    cardsMapB: {},
    flexibleLandAssignment: false,
    globalCardTracker: new Map(),
    ignorePriority: false,
    updateCardStatus: () => {},
    logRejection: () => {},
    logDuplicateRecommendation: () => {},
    getCollectionStatus: () => ({ collection: null, ownedOrBuy: false }),
    safeAddToOutput: () => false,
    SHARED_INCLUSION_MIN: 0,
    THEME_CONFIG: {},
    RESERVED_CREATURE_SLOTS: 0,
    RESERVED_NONCREATURE_SLOTS: 0,
    getCardRarity: () => 'unknown',
    SINGLE_INCLUSION_MIN: 0,
    directToCube: false,
    cubeMaybeboard: false,
    includeMaybeboardBuffer: false,
    ownedMaybeboardBufferCount: 0,
    outCommander: [],
    maybeboardInclusionThreshold: 0
  };

  assert.doesNotThrow(() => {
    deckBuilderCoreService.runCardSelectionPhases(context);
  });
}

function testFinalizeOutputArtifacts() {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-builder-core-'));

  const output = [
    ['C1', 'Card Low', 'Type', 10, 1, 'T1'],
    ['C2', 'Card High', 'Type', 80, 1, 'T1'],
    ['C3', 'Card Mid', 'Type', 45, 1, 'T1']
  ];

  const finalized = deckBuilderCoreService.finalizeOutputArtifacts({
    output,
    produceOutCommander: false,
    outCommander: [],
    directToCube: false,
    themeData: {},
    BASIC_LANDS: [],
    cheapDecks: false,
    useCommanderAsTag: false,
    duplicateNeededLog: [],
    outputDir,
    missingCollectionAudit: new Map([
      ['alpha', 'Alpha Card'],
      ['beta', 'Beta Card']
    ]),
    typeWarnings: [{ name: 'Zeta Card' }, { name: 'Alpha Card' }],
    missingCards: [{ name: 'Gamma Card' }, { name: 'Alpha Card' }]
  });

  assert.equal(finalized[0][1], 'Card High');
  assert.equal(finalized[1][1], 'Card Mid');
  assert.equal(finalized[2][1], 'Card Low');

  const missingCollectionPath = path.join(outputDir, 'missing_cards_from_collection.csv');
  const warningsPath = path.join(outputDir, 'missing_or_type_warnings.csv');

  assert.equal(fs.existsSync(missingCollectionPath), true);
  assert.equal(fs.existsSync(warningsPath), true);

  const missingCollectionContent = fs.readFileSync(missingCollectionPath, 'utf8');
  assert.equal(missingCollectionContent, 'Alpha Card\nBeta Card\n');

  const warningsContent = fs.readFileSync(warningsPath, 'utf8');
  assert.equal(warningsContent, 'name\nAlpha Card\nGamma Card\nZeta Card');
}

function testApplyOutCommanderFilteringTagRemap() {
  const output = [
    ['name', 'set', 'collector number', 'status', 'finish', 'maybeboard', 'tags'],
    ['Card A', 'seta', '1', 'Owned', 'Non-foil', 'FALSE', 'Reanimate'],
    ['Card B', 'setb', '2', 'Owned', 'Non-foil', 'FALSE', 'Dragons'],
    ['Card C', 'setc', '3', 'Owned', 'Non-foil', 'FALSE', 'Artifacts']
  ];

  const filtered = deckBuilderCoreService.applyOutCommanderFiltering({
    output,
    produceOutCommander: true,
    outCommander: [
      { theme: 'Reanimate', commander: 'Teval' },
      { theme: 'Dragons', commander: 'Ureni' }
    ],
    directToCube: true,
    useCommanderAsTag: true
  });

  assert.equal(filtered.length, 3);
  assert.deepEqual(filtered[0], ['name', 'set', 'collector number', 'status', 'finish', 'maybeboard', 'tags']);
  assert.equal(filtered[1][0], 'Card A');
  assert.equal(filtered[1][6], 'Teval');
  assert.equal(filtered[2][0], 'Card B');
  assert.equal(filtered[2][6], 'Ureni');
}

function testBuildOutCommanderListCountsAndLandMultiplier() {
  const outCommanderList = {
    test_mode: ['HalfCommander', 'DoubleCommander']
  };

  const commanderMeta = {
    HalfCommander: {
      theme: 'HalfTheme',
      color: 'UG',
      creature: 20,
      commPriority: 2,
      deckMultiplier: 0.5
    },
    DoubleCommander: {
      theme: 'DoubleTheme',
      color: 'BR',
      creature: 10,
      commPriority: 1,
      deckMultiplier: 2
    }
  };

  const result = deckBuilderCoreService.buildOutCommanderList({
    selectedCommander: 'test_mode',
    outCommanderList,
    commanderMeta,
    totalDeckCount: 100,
    totalLandCount: 40
  });

  assert.equal(result.length, 2);

  assert.deepEqual(result[0], {
    commander: 'HalfCommander',
    theme: 'HalfTheme',
    color: 'UG',
    count: 30,
    creatureCount: 10,
    landCount: 20,
    trackRarity: false,
    commPriority: 2
  });

  assert.deepEqual(result[1], {
    commander: 'DoubleCommander',
    theme: 'DoubleTheme',
    color: 'BR',
    count: 120,
    creatureCount: 20,
    landCount: 40,
    trackRarity: false,
    commPriority: 1
  });
}

function testBuildOutCommanderListThrowsOnMissingCommanderMeta() {
  assert.throws(() => {
    deckBuilderCoreService.buildOutCommanderList({
      selectedCommander: 'test_mode',
      outCommanderList: {
        test_mode: ['KnownCommander', 'UnknownCommander']
      },
      commanderMeta: {
        KnownCommander: {
          theme: 'KnownTheme',
          color: 'W',
          creature: 10,
          commPriority: 1,
          deckMultiplier: 1
        }
      },
      totalDeckCount: 100,
      totalLandCount: 40
    });
  }, /Commander not found in COMMANDER_META: UnknownCommander/);
}

function testApplyOutCommanderFilteringNoopWhenDisabled() {
  const output = [
    ['name', 'set', 'collector number', 'status', 'finish', 'maybeboard', 'tags'],
    ['Card A', 'seta', '1', 'Owned', 'Non-foil', 'FALSE', 'Reanimate'],
    ['Card B', 'setb', '2', 'Owned', 'Non-foil', 'FALSE', 'Dragons'],
    ['Card C', 'setc', '3', 'Owned', 'Non-foil', 'FALSE', 'Artifacts']
  ];

  const result = deckBuilderCoreService.applyOutCommanderFiltering({
    output,
    produceOutCommander: false,
    outCommander: [
      { theme: 'Reanimate', commander: 'Teval' }
    ],
    directToCube: true,
    useCommanderAsTag: true
  });

  assert.equal(result, output);
  assert.equal(result.length, 4);
  assert.equal(result[3][6], 'Artifacts');
}

testRunCardSelectionPhasesSmoke();
testFinalizeOutputArtifacts();
testApplyOutCommanderFilteringTagRemap();
testBuildOutCommanderListCountsAndLandMultiplier();
testBuildOutCommanderListThrowsOnMissingCommanderMeta();
testApplyOutCommanderFilteringNoopWhenDisabled();

console.log('deck_builder_core_service test passed');
