const fs = require('fs');
const https = require('https');
const path = require('path');
const { parseCsvText, csvRowsToText } = require('../shared/csv_utils');
const { normalizeName } = require('../shared/name_normalize');

const COLLECTION_PATH = path.join(__dirname, 'cardcollection.csv');
const CARDTYPES_PATH = path.join(__dirname, 'cardtypes.csv');
const FORMATTED_BATCH_PATH = path.join(__dirname, '..', 'inputFiles', 'aa_fullinput_formatted_batch.csv');
const LOOKUP_REPORT_PATH = path.join(__dirname, '..', 'outputs', 'batch_input_type_lookup_results.csv');

function writeCSV(filePath, rows) {
  fs.writeFileSync(filePath, csvRowsToText(rows), 'utf8');
}

function canonicalizeType(typeLine) {
  const value = String(typeLine || '').trim();
  if (!value) return '';
  if (/Creature/i.test(value)) return 'Creature';
  if (/Land/i.test(value)) return 'Land';
  if (/Planeswalker/i.test(value)) return 'Planeswalker';
  if (/Battle/i.test(value)) return 'Battle';
  if (/Artifact/i.test(value)) return 'Artifact';
  if (/Enchantment/i.test(value)) return 'Enchantment';
  if (/Instant/i.test(value)) return 'Instant';
  if (/Sorcery/i.test(value)) return 'Sorcery';
  return 'Unknown';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestJson(options, body, retryCount = 0) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, async (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        raw += chunk;
      });
      res.on('end', async () => {
        if (res.statusCode === 429 && retryCount < 4) {
          const retryAfter = Number(res.headers['retry-after'] || 1);
          await sleep(retryAfter * 1000);
          try {
            resolve(await requestJson(options, body, retryCount + 1));
          } catch (error) {
            reject(error);
          }
          return;
        }

        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode}: ${raw.slice(0, 300)}`));
          return;
        }

        try {
          resolve(JSON.parse(raw));
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

async function lookupCollectionBatch(names) {
  const payload = JSON.stringify({
    identifiers: names.map((name) => ({ name }))
  });

  return requestJson({
    hostname: 'api.scryfall.com',
    path: '/cards/collection',
    method: 'POST',
    headers: {
      'User-Agent': 'cube-type-backfill/1.0',
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  }, payload);
}

async function lookupFuzzy(name) {
  return requestJson({
    hostname: 'api.scryfall.com',
    path: '/cards/named?fuzzy=' + encodeURIComponent(name),
    method: 'GET',
    headers: {
      'User-Agent': 'cube-type-backfill/1.0',
      'Accept': 'application/json'
    }
  });
}

function getBatchTargets(collectionRows, batchRows) {
  const batchNameSet = new Set(
    batchRows
      .map((row) => normalizeName(row[0] || ''))
      .filter(Boolean)
  );

  const targets = [];
  for (let index = 1; index < collectionRows.length; index++) {
    const row = collectionRows[index];
    const name = row[0] || '';
    const normalized = normalizeName(name);
    const type = String(row[1] || '').trim().toLowerCase();
    if (!normalized || !batchNameSet.has(normalized)) continue;
    if (type && type !== 'unknown') continue;
    targets.push({ name, normalized });
  }

  return targets;
}

async function main() {
  if (!fs.existsSync(COLLECTION_PATH)) {
    throw new Error(`Missing ${COLLECTION_PATH}`);
  }
  if (!fs.existsSync(FORMATTED_BATCH_PATH)) {
    throw new Error(`Missing ${FORMATTED_BATCH_PATH}`);
  }

  const collectionRows = parseCsvText(fs.readFileSync(COLLECTION_PATH, 'utf8'), { trim: false });
  const batchRows = parseCsvText(fs.readFileSync(FORMATTED_BATCH_PATH, 'utf8'), { trim: false });
  const cardtypesRows = fs.existsSync(CARDTYPES_PATH)
    ? parseCsvText(fs.readFileSync(CARDTYPES_PATH, 'utf8'), { trim: false })
    : [['name', 'type', 'type_line']];

  const targets = getBatchTargets(collectionRows, batchRows);
  console.log(`Found ${targets.length} batch cards with blank or Unknown types.`);

  if (targets.length === 0) {
    writeCSV(LOOKUP_REPORT_PATH, [['name', 'lookup_type', 'type_line', 'source', 'status']]);
    console.log('Nothing to backfill.');
    return;
  }

  const results = new Map();
  const unresolved = [];
  const batchSize = 75;

  for (let start = 0; start < targets.length; start += batchSize) {
    const batch = targets.slice(start, start + batchSize);
    const names = batch.map((item) => item.name);
    const response = await lookupCollectionBatch(names);

    if (Array.isArray(response.data)) {
      for (const card of response.data) {
        const normalized = normalizeName(card.name);
        results.set(normalized, {
          name: card.name,
          lookupType: canonicalizeType(card.type_line),
          typeLine: card.type_line || '',
          source: 'scryfall-collection',
          status: 'resolved'
        });
      }
    }

    if (Array.isArray(response.not_found)) {
      for (const item of response.not_found) {
        const unresolvedName = item.name || '';
        if (unresolvedName) unresolved.push(unresolvedName);
      }
    }

    console.log(`Collection lookup ${Math.min(start + batch.length, targets.length)}/${targets.length}`);
    await sleep(120);
  }

  for (const name of unresolved) {
    try {
      const fuzzy = await lookupFuzzy(name);
      results.set(normalizeName(name), {
        name,
        lookupType: canonicalizeType(fuzzy.type_line),
        typeLine: fuzzy.type_line || '',
        source: 'scryfall-fuzzy',
        status: 'resolved'
      });
    } catch (error) {
      results.set(normalizeName(name), {
        name,
        lookupType: '',
        typeLine: '',
        source: 'scryfall-fuzzy',
        status: 'unresolved',
        error: error.message
      });
    }
    await sleep(120);
  }

  let updatedCount = 0;
  let unresolvedCount = 0;
  const reportRows = [['name', 'lookup_type', 'type_line', 'source', 'status']];
  const updatedCollectionRows = [collectionRows[0]];

  for (let index = 1; index < collectionRows.length; index++) {
    const row = collectionRows[index];
    const name = row[0] || '';
    const normalized = normalizeName(name);
    const currentType = String(row[1] || '').trim();
    const match = results.get(normalized);

    if (match && (!currentType || currentType.toLowerCase() === 'unknown') && match.lookupType && match.lookupType !== 'Unknown') {
      updatedCollectionRows.push([row[0], match.lookupType, ...row.slice(2)]);
      updatedCount++;
      reportRows.push([name, match.lookupType, match.typeLine, match.source, 'updated']);
    } else {
      updatedCollectionRows.push(row);
      if (match) {
        const status = match.lookupType && match.lookupType !== 'Unknown' ? 'skipped' : 'unresolved';
        if (status === 'unresolved') unresolvedCount++;
        reportRows.push([name, match.lookupType, match.typeLine, match.source, status]);
      }
    }
  }

  const cardtypesMap = new Map();
  for (let index = 1; index < cardtypesRows.length; index++) {
    const row = cardtypesRows[index];
    const normalized = normalizeName(row[0] || '');
    if (!normalized) continue;
    cardtypesMap.set(normalized, [row[0], row[1] || '', row[2] || '']);
  }

  for (const [normalized, match] of results.entries()) {
    if (!match.lookupType || match.lookupType === 'Unknown') continue;
    cardtypesMap.set(normalized, [match.name, match.lookupType, match.typeLine]);
  }

  const updatedCardtypesRows = [['name', 'type', 'type_line'], ...Array.from(cardtypesMap.values()).sort((a, b) => a[0].localeCompare(b[0]))];

  writeCSV(COLLECTION_PATH, updatedCollectionRows);
  writeCSV(CARDTYPES_PATH, updatedCardtypesRows);
  writeCSV(LOOKUP_REPORT_PATH, reportRows);

  console.log(JSON.stringify({
    targets: targets.length,
    updatedCount,
    unresolvedCount,
    lookupReport: LOOKUP_REPORT_PATH,
    collectionPath: COLLECTION_PATH,
    cardtypesPath: CARDTYPES_PATH
  }, null, 2));
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});