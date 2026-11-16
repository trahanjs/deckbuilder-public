const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const builderPath = path.join(projectRoot, 'cubeAndDeckBuilder');
const outputsDir = path.join(projectRoot, 'outputs');
const snapshotsDir = path.join(__dirname, 'snapshots');

function normalizeCsv(text) {
  return String(text || '').replace(/\r\n/g, '\n');
}

function countLines(text) {
  const normalized = normalizeCsv(text).replace(/\n$/, '');
  if (!normalized) return 0;
  return normalized.split('\n').length;
}

function readRequiredFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Required file missing: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

function buildEnv(overrides) {
  const env = { ...process.env };
  delete env.WEB_CONFIG;
  delete env.DECK_GROUP;
  delete env.DECK_COMMANDER;

  for (const [key, value] of Object.entries(overrides || {})) {
    env[key] = String(value);
  }

  return env;
}

function runBuilder(overrides) {
  execFileSync(process.execPath, [builderPath], {
    cwd: projectRoot,
    env: buildEnv(overrides),
    stdio: 'pipe'
  });
}

function assertSnapshot({
  outputFile,
  snapshotFile,
  expectedLineCount,
  envOverrides,
  label
}) {
  runBuilder(envOverrides);

  const outputPath = path.join(outputsDir, outputFile);
  const snapshotPath = path.join(snapshotsDir, snapshotFile);

  const actual = readRequiredFile(outputPath);
  const expected = readRequiredFile(snapshotPath);

  assert.equal(
    countLines(actual),
    expectedLineCount,
    `${label}: expected ${expectedLineCount} lines in ${outputFile}`
  );

  assert.equal(
    normalizeCsv(actual),
    normalizeCsv(expected),
    `${label}: output mismatch for ${outputFile} versus snapshot ${snapshotFile}`
  );
}

assertSnapshot({
  label: 'Version 1 (single Betor)',
  outputFile: 'combinedDeckOutput.csv',
  snapshotFile: 'version1_single_betor_combinedDeckOutput.csv',
  expectedLineCount: 131,
  envOverrides: {
    DECK_GROUP: 'new_primary_5',
    DECK_COMMANDER: 'single',
    WEB_CONFIG: JSON.stringify({
      outCommanderList: {
        single: ['Betor']
      }
    })
  }
});

assertSnapshot({
  label: 'Version 2 (new_primary_4 + new_primary_5 + new_primary_wedges)',
  outputFile: 'cubeOutput_deduped.csv',
  snapshotFile: 'version2_multi_cubeOutput_deduped.csv',
  expectedLineCount: 525,
  envOverrides: {
    WEB_CONFIG: JSON.stringify({
      defaultConfigurations: [
        { selectedGroup: 'new_primary_4', selectedCommander: 'new_primary_4' },
        { selectedGroup: 'new_primary_5', selectedCommander: 'new_primary_5' },
        { selectedGroup: 'new_primary_wedges', selectedCommander: 'new_primary_wedges' }
      ],
      outCommanderList: {
        new_primary_4: ['Stella', 'Betor', 'Hakbal', 'Zuko'],
        new_primary_5: ['Bello'],
        new_primary_wedges: ['Teval', 'Isshin', 'Ureni']
      }
    })
  }
});

console.log('deck_builder_snapshot test passed');
