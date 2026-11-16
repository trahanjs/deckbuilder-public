const fs = require('fs');
const https = require('https');
const path = require('path');
const { parseCsvText, csvRowsToText } = require('../shared/csv_utils');
const { normalizeName } = require('../shared/name_normalize');

function normalize(str) {
  return normalizeName(str);
}

const collectionPath = path.join(__dirname, 'cardcollection.csv');
const batchPath = path.join(__dirname, '..', 'inputFiles', 'aa_fullinput_formatted_batch.csv');
const outPath = path.join(__dirname, 'cardtypes.csv');

function scryfallNamed(name, exactOnly = false) {
  return new Promise((resolve, reject) => {
    const tryNamed = (mode) => {
      const url = `/cards/named?${mode}=` + encodeURIComponent(name);
      const opts = {
        hostname: 'api.scryfall.com',
        path: url,
        method: 'GET',
        headers: { 'User-Agent': 'card-type-populator/1.0', 'Accept': 'application/json' }
      };
      const req = https.request(opts, res => {
        let raw = '';
        res.on('data', d => raw += d);
        res.on('end', () => {
          try {
            const j = JSON.parse(raw);
            if (j && j.type_line) return resolve(j.type_line);
            // If exact was requested and failed, try fuzzy unless exactOnly
            if (mode === 'exact' && !exactOnly) return tryNamed('fuzzy');
            return reject(new Error(`no type_line (${res.statusCode}) ${raw.substring(0,200)}`));
          } catch (e) { return reject(e); }
        });
      });
      req.on('error', reject);
      req.end();
    };
    // try exact first
    tryNamed('exact');
  });
}

async function main() {
  if (!fs.existsSync(collectionPath)) {
    console.error('Missing', collectionPath);
    process.exit(1);
  }
  const collRaw = fs.readFileSync(collectionPath, 'utf8');
  const coll = parseCsvText(collRaw, { trim: false });
  const collNames = new Set(coll.slice(1).map(r => normalize(r[0]))); // skip header

  let batchNames = null;
  if (fs.existsSync(batchPath)) {
    const batchRaw = fs.readFileSync(batchPath, 'utf8');
    const batch = parseCsvText(batchRaw, { trim: false });
    batchNames = new Set(batch.map(r => normalize(r[0])));
  }

  // Intersection (only query cards present in both files) when batch available
  const targets = [];
  if (batchNames) {
    for (const n of collNames) if (batchNames.has(n)) targets.push(n);
  } else {
    for (const n of collNames) targets.push(n);
  }

  console.log('Querying Scryfall for', targets.length, 'cards (intersection of collection and batch)');

  const map = {};
  const typesSeen = {};

  for (let i = 0; i < targets.length; i++) {
    const nameNorm = targets[i];
    const origName = coll.find(r => normalize(r[0]) === nameNorm)[0];
    try {
      // respectful delay to avoid hitting rate limits
      if (i > 0) await new Promise(r => setTimeout(r, 150));
      const typeLine = await scryfallNamed(origName);
      // Simplify type_line into canonical single type.
      // Priority: Battle -> Creature -> Planeswalker -> Land -> Artifact -> Enchantment -> Instant -> Sorcery
      let canonical = 'Other';
      if (/Battle/i.test(typeLine)) canonical = 'Battle';
      else if (/Creature/i.test(typeLine)) canonical = 'Creature';
      else if (/Planeswalker/i.test(typeLine)) canonical = 'Planeswalker';
      else if (/Land/i.test(typeLine)) canonical = 'Land';
      // Prefer Artifact before Enchantment to handle 'Artifact Enchantment' cases
      else if (/Artifact/i.test(typeLine)) canonical = 'Artifact';
      else if (/Enchantment/i.test(typeLine)) canonical = 'Enchantment';
      else if (/Instant/i.test(typeLine)) canonical = 'Instant';
      else if (/Sorcery/i.test(typeLine)) canonical = 'Sorcery';

      map[origName] = { type_line: typeLine, type: canonical };
      typesSeen[canonical] = (typesSeen[canonical] || 0) + 1;
      if (i % 50 === 0) console.log(`Progress ${i}/${targets.length}`);
    } catch (e) {
      map[origName] = { type_line: null, type: 'Unknown', error: String(e).substring(0,200) };
      typesSeen['Unknown'] = (typesSeen['Unknown'] || 0) + 1;
    }
  }

  // write cardtypes.csv
  const rows = [['name','type','type_line']];
  Object.keys(map).sort().forEach(name => rows.push([`"${name.replace(/"/g,'""') }"`, map[name].type, map[name].type_line || '']));
  fs.writeFileSync(outPath, csvRowsToText(rows), 'utf8');
  console.log('Wrote', outPath);

  console.log('Types summary:');
  Object.keys(typesSeen).sort().forEach(t => console.log(t + ':', typesSeen[t]));
  console.log('Unique types:', Object.keys(typesSeen).sort().join(', '));
}

main().catch(e => { console.error(e); process.exit(1); });
