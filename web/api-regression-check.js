'use strict';

const BASE_URL = process.env.DECK_BUILDER_URL || 'http://localhost:3000';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function parseLines(filteredCsv) {
  return String(filteredCsv || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function postBuildDeck(body) {
  const response = await fetch(`${BASE_URL}/api/build-deck`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error(`Expected JSON response, got: ${text.slice(0, 300)}`);
  }

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}: ${JSON.stringify(data)}`);
  }

  return data;
}

function checkNoHeader(lines) {
  assert(lines.length > 0, 'Expected at least one output line.');
  assert(lines[0] !== 'Card Name (set code)', 'Header should not be present.');
}

function checkNoWrappedQuotes(lines) {
  const wrapped = lines.filter((line) => line.startsWith('"') && line.endsWith('"'));
  assert(wrapped.length === 0, `Found wrapped-quote card names: ${wrapped.slice(0, 5).join(', ')}`);
}

function checkSingleOutputFormatting(lines) {
  const hasBasicLand = lines.some((line) => /^(\d+)\s+(Island|Swamp|Forest|Mountain|Plains)$/i.test(line));
  const hasSetCode = lines.some((line) => /\([a-z0-9]{2,5}\)$/i.test(line));

  assert(hasBasicLand, 'Expected at least one basic land entry like "2 Island".');
  assert(hasSetCode, 'Expected at least one card name with set code like "Command Tower (soc)".');
}

function checkThemeFilterNotNameMatch(lines) {
  const hasNonDragonName = lines.some((line) => !/dragon/i.test(line));
  assert(hasNonDragonName, 'Expected at least one returned card whose name does not contain "dragon".');
}

function checkNoBasicLands(lines) {
  const basicLandPattern = /^(?:\d+\s+)?(?:Plains|Island|Swamp|Mountain|Forest|Wastes|Snow-Covered Plains|Snow-Covered Island|Snow-Covered Swamp|Snow-Covered Mountain|Snow-Covered Forest)(?:\s*\([a-z0-9]{2,5}\))?$/i;
  const basics = lines.filter((line) => basicLandPattern.test(line));
  assert(basics.length === 0, `Expected no basic lands in multi-output export, found: ${basics.slice(0, 5).join(', ')}`);
}

function checkHasSetCode(lines) {
  const hasSetCode = lines.some((line) => /\([a-z0-9]{2,5}\)$/i.test(line));
  assert(hasSetCode, 'Expected at least one card with set code in export.');
}

async function run() {
  console.log(`Running API regression checks against ${BASE_URL}`);

  const singleOutputPayload = {
    rows: [
      { theme: 'Reanimate', primaryCommander: 'Teval', secondaryCommander: 'Sidisi' },
      { theme: 'Dragons', primaryCommander: 'Ureni', secondaryCommander: 'Miirym' }
    ],
    outputThemes: ['Reanimate']
  };

  const singleOutputResponse = await postBuildDeck(singleOutputPayload);
  const singleLines = parseLines(singleOutputResponse.filteredCsv);

  checkNoHeader(singleLines);
  checkNoWrappedQuotes(singleLines);
  checkSingleOutputFormatting(singleLines);
  console.log('PASS single-output checks');

  const multiOutputPayload = {
    rows: [
      { theme: 'Dragons', primaryCommander: 'Ureni', secondaryCommander: 'Miirym' },
      { theme: 'Reanimate', primaryCommander: 'Teval', secondaryCommander: 'Sidisi' }
    ],
    outputThemes: ['Dragons', 'Reanimate']
  };

  const multiOutputResponse = await postBuildDeck(multiOutputPayload);
  const multiLines = parseLines(multiOutputResponse.filteredCsv);

  checkNoHeader(multiLines);
  checkNoWrappedQuotes(multiLines);
  checkThemeFilterNotNameMatch(multiLines);
  checkNoBasicLands(multiLines);
  checkHasSetCode(multiLines);
  console.log('PASS multi-output checks');

  console.log('All API regression checks passed.');
}

run().catch((error) => {
  console.error('API regression checks failed.');
  console.error(error.message);
  process.exit(1);
});
