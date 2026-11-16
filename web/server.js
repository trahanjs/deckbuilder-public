const express = require('express');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { parse } = require('csv-parse/sync');
const Stringify = require('csv-stringify/sync');
const { normalizeName } = require('../shared/name_normalize');

const app = express();
const PORT = process.env.PORT || 3000;
const projectRoot = path.resolve(__dirname, '..');
const legacyBuilderPath = path.join(projectRoot, 'cubeAndDeckBuilder');
const builderConfigPath = path.join(projectRoot, 'builderConfig.js');
const builderMetadataPath = path.join(projectRoot, 'outputs', 'builder_metadata.json');
const outputCsvPath = path.join(projectRoot, 'outputs', 'combinedDeckOutput.csv');
const formattedBatchPath = path.join(projectRoot, 'inputFiles', 'aa_fullinput_formatted_batch.csv');
const BASIC_LANDS = [
  { color: 'W', name: 'Plains' },
  { color: 'U', name: 'Island' },
  { color: 'B', name: 'Swamp' },
  { color: 'R', name: 'Mountain' },
  { color: 'G', name: 'Forest' }
];

function extractConstObject(source, constName) {
  const marker = `const ${constName} = `;
  const startIndex = source.indexOf(marker);

  if (startIndex === -1) {
    return null;
  }

  let i = startIndex + marker.length;
  if (source[i] !== '{') {
    return null;
  }

  let depth = 0;
  let inString = false;
  let quoteChar = '';

  for (; i < source.length; i += 1) {
    const ch = source[i];

    if (inString) {
      if (ch === '\\') {
        i += 1;
        continue;
      }

      if (ch === quoteChar) {
        inString = false;
        quoteChar = '';
      }
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      inString = true;
      quoteChar = ch;
      continue;
    }

    if (ch === '{') {
      depth += 1;
      continue;
    }

    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(startIndex + marker.length, i + 1);
      }
    }
  }

  return null;
}

function emptyBuilderMetadata() {
  return {
    commanders: {},
    themes: {},
    themeConfig: {},
    commanderSets: {},
    outCommanders: {},
    defaultConfigurations: []
  };
}

function loadBuilderMetadataFromSource() {
  const toMetadata = (commanderMeta, themeConfig, commanderSets, outCommanders = {}, defaultConfigurations = []) => {
    const commanders = {};
    for (const [name, meta] of Object.entries(commanderMeta || {})) {
      if (!meta || typeof meta !== 'object') continue;
      const normalizedName = String(name).trim();
      const themeName = String(meta.theme || '').trim();
      commanders[normalizedName.toLowerCase()] = {
        name: normalizedName,
        theme: themeName,
        color: String(meta.color || '').trim(),
        group: 'primary'
      };
    }

    for (const [groupName, themes] of Object.entries(commanderSets || {})) {
      for (const [themeName, themeConfigEntry] of Object.entries(themes || {})) {
        const primaryCommander = themeConfigEntry && themeConfigEntry.primary ? themeConfigEntry.primary : null;
        const secondaryCommander = themeConfigEntry && themeConfigEntry.secondary ? themeConfigEntry.secondary : null;

        if (primaryCommander && commanders[primaryCommander.toLowerCase()]) {
          commanders[primaryCommander.toLowerCase()].group = groupName;
          commanders[primaryCommander.toLowerCase()].theme = themeName;
        }

        if (secondaryCommander && commanders[secondaryCommander.toLowerCase()]) {
          commanders[secondaryCommander.toLowerCase()].group = groupName;
          commanders[secondaryCommander.toLowerCase()].theme = themeName;
        }
      }
    }

    const themes = {};
    for (const [groupName, themesByGroup] of Object.entries(commanderSets || {})) {
      for (const [themeName, themeConfigEntry] of Object.entries(themesByGroup || {})) {
        const primaryCommander = themeConfigEntry && themeConfigEntry.primary ? themeConfigEntry.primary : null;
        const themeKey = String(themeName).trim().toLowerCase();
        themes[themeKey] = {
          name: themeName,
          group: groupName,
          primaryCommander: primaryCommander,
          selectedCommander: primaryCommander ? 'single' : 'primary'
        };
      }
    }

    return {
      commanders,
      themes,
      themeConfig,
      commanderSets,
      outCommanders,
      defaultConfigurations
    };
  };

  try {
    // Prefer the extracted config module now that builder constants live outside the legacy script.
    delete require.cache[require.resolve(builderConfigPath)];
    const builderConfig = require(builderConfigPath);

    return toMetadata(
      builderConfig.COMMANDER_META || {},
      builderConfig.THEME_CONFIG || {},
      builderConfig.BUILDER_DEFAULT_COMMANDER_SETS || {},
      builderConfig.BUILDER_DEFAULT_OUT_COMMANDER_LIST || {},
      builderConfig.BUILDER_DEFAULT_CONFIGURATION_SETS || []
    );
  } catch (error) {
    // Fall through to legacy source parsing for backward compatibility.
  }

  try {
    const builderSource = fs.readFileSync(legacyBuilderPath, 'utf8');

    const commanderMetaLiteral = extractConstObject(builderSource, 'COMMANDER_META');
    const themeConfigLiteral = extractConstObject(builderSource, 'THEME_CONFIG');
    const commanderSetsLiteral =
      extractConstObject(builderSource, 'BUILDER_DEFAULT_COMMANDER_SETS') ||
      extractConstObject(builderSource, 'COMMANDER_SETS');

    if (!commanderMetaLiteral || !themeConfigLiteral || !commanderSetsLiteral) {
      return emptyBuilderMetadata();
    }

    const commanderMeta = Function(
      'NO_MULT',
      'SMALL_MULT',
      'LARGE_MULT',
      'MAX_MULT',
      `return (${commanderMetaLiteral})`
    )(1, 0.6, 1.15, 1.2);

    const themeConfig = Function(
      'NO_MULT',
      'SMALL_MULT',
      'LARGE_MULT',
      'MAX_MULT',
      `return (${themeConfigLiteral})`
    )(1, 0.6, 1.15, 1.2);

    const commanderSets = Function(
      'NO_MULT',
      'SMALL_MULT',
      'LARGE_MULT',
      'MAX_MULT',
      `return (${commanderSetsLiteral})`
    )(1, 0.6, 1.15, 1.2);

    return toMetadata(commanderMeta, themeConfig, commanderSets, {}, []);
  } catch (error) {
    return emptyBuilderMetadata();
  }
}

function loadBuilderMetadataFromFile() {
  if (!fs.existsSync(builderMetadataPath)) {
    return emptyBuilderMetadata();
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(builderMetadataPath, 'utf8'));
    if (parsed && typeof parsed === 'object' && parsed.commanders && parsed.themes) {
      return {
        commanders: parsed.commanders || {},
        themes: parsed.themes || {},
        themeConfig: parsed.themeConfig || {},
        commanderSets: parsed.commanderSets || {},
        outCommanders: parsed.outCommanderList || {},
        defaultConfigurations: parsed.defaultConfigurations || []
      };
    }
  } catch (error) {
    return emptyBuilderMetadata();
  }

  return emptyBuilderMetadata();
}

function loadBuilderMetadata() {
  const fileMetadata = loadBuilderMetadataFromFile();
  const sourceMetadata = loadBuilderMetadataFromSource();

  const fileThemeCount = Object.keys(fileMetadata.themes || {}).length;
  const sourceThemeCount = Object.keys(sourceMetadata.themes || {}).length;

  const fileCommanderCount = Object.keys(fileMetadata.commanders || {}).length;
  const sourceCommanderCount = Object.keys(sourceMetadata.commanders || {}).length;

  const sourceLooksRicher =
    sourceThemeCount > fileThemeCount ||
    sourceCommanderCount > fileCommanderCount;

  return sourceLooksRicher ? sourceMetadata : fileMetadata;
}

function loadFormattedBatchCommanders() {
  if (!fs.existsSync(formattedBatchPath)) {
    return new Set();
  }

  try {
    const fileContent = fs.readFileSync(formattedBatchPath, 'utf8');
    const rows = parse(fileContent, {
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      bom: true
    });

    const commanders = new Set();
    rows.forEach((row) => {
      const commander = row[5] || row[0] || '';
      if (commander && String(commander).trim()) {
        commanders.add(normalizeName(commander));
      }
    });

    return commanders;
  } catch (error) {
    return new Set();
  }
}

function resolveRequestRows(requestBody = {}) {
  const rows = Array.isArray(requestBody.rows)
    ? requestBody.rows
    : [
        {
          theme: requestBody.theme || '',
          primaryCommander: requestBody.commander || requestBody.primaryCommander || '',
          secondaryCommander: requestBody.secondaryCommander || ''
        }
      ];

  return rows
    .map((row) => ({
      theme: String(row?.theme || '').trim(),
      primaryCommander: String(row?.primaryCommander || row?.commander || '').trim(),
      secondaryCommander: String(row?.secondaryCommander || '').trim(),
      outputTheme: String(row?.outputTheme || row?.theme || '').trim()
    }))
    .filter((row) => row.theme || row.primaryCommander || row.secondaryCommander || row.outputTheme);
}

function getOutputThemeSelection(requestBody = {}) {
  const directValues = Array.isArray(requestBody.outputThemes)
    ? requestBody.outputThemes
    : typeof requestBody.outputThemes === 'string'
      ? [requestBody.outputThemes]
      : [];

  const flattened = [...directValues.map((value) => String(value || '').trim())]
    .filter(Boolean);

  return [...new Set(flattened)];
}

function buildRuntimeConfig(requestBody = {}) {
  const builderMetadata = loadBuilderMetadata();
  const rows = resolveRequestRows(requestBody);
  const warnings = [];
  const validRows = [];
  const availableCommanders = loadFormattedBatchCommanders();
  const outputThemeSelection = getOutputThemeSelection(requestBody);

  rows.forEach((row, index) => {
    const themeName = row.theme || row.outputTheme || '';
    const primaryCommander = row.primaryCommander || '';
    const secondaryCommander = row.secondaryCommander || '';

    if (!themeName) {
      return;
    }

    const normalizedTheme = normalizeName(themeName);
    const normalizedPrimary = normalizeName(primaryCommander);
    const normalizedSecondary = normalizeName(secondaryCommander);

    if (!normalizedPrimary) {
      warnings.push(`Theme "${themeName}" is missing a primary commander.`);
      return;
    }

    if (!builderMetadata.themes[normalizedTheme]) {
      warnings.push(`Theme "${themeName}" was not found in the builder metadata.`);
    }

    if (!builderMetadata.commanders[normalizedPrimary]) {
      warnings.push(`Primary commander "${primaryCommander}" was not found in the builder metadata.`);
    }

    if (normalizedSecondary && !builderMetadata.commanders[normalizedSecondary]) {
      warnings.push(`Secondary commander "${secondaryCommander}" was not found in the builder metadata.`);
    }

    if (!availableCommanders.has(normalizedPrimary)) {
      warnings.push(`Primary commander "${primaryCommander}" is missing from ${path.basename(formattedBatchPath)}.`);
    }

    if (normalizedSecondary && !availableCommanders.has(normalizedSecondary)) {
      warnings.push(`Secondary commander "${secondaryCommander}" is missing from ${path.basename(formattedBatchPath)}.`);
    }

    validRows.push({
      theme: themeName,
      primaryCommander: primaryCommander,
      secondaryCommander: secondaryCommander,
      outputTheme: row.outputTheme || themeName
    });
  });

  const uniqueTargetCommanders = [...new Set(
    validRows.flatMap((row) => [row.primaryCommander, row.secondaryCommander]).filter(Boolean).map((name) => name.trim())
  )];

  const uniqueTargetThemes = [...new Set(
    validRows.map((row) => (row.outputTheme || row.theme || '').trim()).filter(Boolean)
  )];

  const selectedOutputThemes = outputThemeSelection.length > 0
    ? outputThemeSelection
    : uniqueTargetThemes;

  selectedOutputThemes.forEach((themeName) => {
    if (!uniqueTargetThemes.includes(themeName)) {
      warnings.push(`Output theme "${themeName}" was not part of the configured build rows.`);
    }
  });

  const rowsForBuilder = rows.filter((row) => row.theme && row.primaryCommander);
  const selectedCommanderMode = rowsForBuilder.length === 1 ? 'single' : 'primary';

  const commanderSets = {
    primary: Object.fromEntries(
      rowsForBuilder
        .filter((row) => row.theme && row.primaryCommander)
        .map((row) => [
          row.theme,
          {
            primary: row.primaryCommander,
            secondary: row.secondaryCommander || row.primaryCommander
          }
        ])
    )
  };

  const outCommanderList = {
    single: [rowsForBuilder[0]?.primaryCommander || ''],
    primary: rowsForBuilder
      .filter((row) => row.primaryCommander)
      .map((row) => row.primaryCommander)
  };

  const defaultConfigurations = [{
    selectedGroup: 'primary',
    selectedCommander: selectedCommanderMode
  }];

  return {
    selectedGroup: 'primary',
    selectedCommander: selectedCommanderMode,
    targetCommanders: uniqueTargetCommanders,
    targetThemes: uniqueTargetThemes,
    selectedOutputThemes,
    warnings,
    validRows,
    builderConfig: {
      commanderSets,
      outCommanderList,
      defaultConfigurations
    }
  };
}

function resolveDeckConfig(requestBody = {}) {
  const runtimeConfig = buildRuntimeConfig(requestBody);
  return {
    selectedGroup: runtimeConfig.selectedGroup,
    selectedCommander: runtimeConfig.selectedCommander,
    targetCommanders: runtimeConfig.targetCommanders,
    targetThemes: runtimeConfig.targetThemes,
    selectedOutputThemes: runtimeConfig.selectedOutputThemes,
    warnings: runtimeConfig.warnings,
    validRows: runtimeConfig.validRows,
    builderConfig: runtimeConfig.builderConfig
  };
}

function buildUiMetadata() {
  const builderMetadata = loadBuilderMetadata();
  const themes = [];
  const commanders = Object.values(builderMetadata.commanders || {}).filter((entry) => entry && typeof entry === 'object');

  for (const themeEntry of Object.values(builderMetadata.themes || {})) {
    const themeName = String(themeEntry?.name || '').trim();
    const groupName = String(themeEntry?.group || '').trim();

    if (!themeName) {
      continue;
    }

    const matchingCommanders = commanders
      .filter((commander) => normalizeName(commander.theme) === normalizeName(themeName))
      .filter((commander) => !groupName || !commander.group || commander.group === groupName)
      .map((commander) => String(commander.name || '').trim())
      .filter(Boolean);

    let defaultPrimaryCommander = String(themeEntry?.primaryCommander || '').trim();
    if (!defaultPrimaryCommander && matchingCommanders.length > 0) {
      defaultPrimaryCommander = matchingCommanders[0];
    }

    const setByGroup = builderMetadata.commanderSets?.[groupName] || {};
    const themeSetEntry = Object.entries(setByGroup).find(([setThemeName]) => {
      return normalizeName(setThemeName) === normalizeName(themeName);
    })?.[1] || null;
    const defaultSecondaryCommander = String(themeSetEntry?.secondary || '').trim();

    const primaryOptions = [...new Set([
      defaultPrimaryCommander,
      ...matchingCommanders
    ].filter(Boolean))];

    const secondaryOptions = [...new Set([
      defaultSecondaryCommander,
      ...matchingCommanders
    ].filter(Boolean))];

    themes.push({
      name: themeName,
      group: groupName,
      defaultPrimaryCommander,
      defaultSecondaryCommander,
      primaryOptions,
      secondaryOptions
    });
  }

  themes.sort((a, b) => a.name.localeCompare(b.name));
  return { themes };
}

function sanitizeCardName(value) {
  return String(value || '').trim().replace(/^"+|"+$/g, '');
}

function isBasicLandName(value) {
  const normalized = normalizeName(String(value || '').replace(/^\d+\s+/, ''));
  return [
    'plains',
    'island',
    'swamp',
    'mountain',
    'forest',
    'wastes',
    'snow-covered plains',
    'snow-covered island',
    'snow-covered swamp',
    'snow-covered mountain',
    'snow-covered forest'
  ].includes(normalized);
}

function filterRowsForRequest(rows, request) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }

  const header = rows[0];
  const selectedOutputThemes = (request?.selectedOutputThemes || request?.targetThemes || []).map((value) => normalizeName(value));
  const themeToCommanderTag = new Set(
    (request?.validRows || [])
      .map((row) => ({
        theme: normalizeName(row?.outputTheme || row?.theme || ''),
        commander: normalizeName(row?.primaryCommander || '')
      }))
      .filter((entry) => entry.theme && entry.commander && (!selectedOutputThemes.length || selectedOutputThemes.includes(entry.theme)))
      .map((entry) => entry.commander)
  );

  const normalizeTags = (value) => String(value || '')
    .split(/[;,]/)
    .map((part) => normalizeName(part))
    .filter(Boolean);

  const rowMatchesSelectedTheme = (row) => {
    if (selectedOutputThemes.length === 0) {
      return true;
    }

    const tagCell = row.length > 6 ? row[6] : row[row.length - 1];
    const tags = normalizeTags(tagCell);

    if (!tags.length || !themeToCommanderTag.size) {
      return false;
    }

    return tags.some((tag) => themeToCommanderTag.has(tag));
  };

  const matchingRows = rows.slice(1).filter((row) => {
    if (!Array.isArray(row) || row.length === 0) {
      return false;
    }

    return rowMatchesSelectedTheme(row);
  });

  if (!matchingRows.length) {
    return [header];
  }

  return [header, ...matchingRows];
}

function getSingleOutputSelection(request) {
  const selectedOutputThemes = (request?.selectedOutputThemes || request?.targetThemes || [])
    .map((value) => normalizeName(value))
    .filter(Boolean);

  if (selectedOutputThemes.length !== 1) {
    return null;
  }

  const selectedTheme = selectedOutputThemes[0];
  const matchingRow = (request?.validRows || []).find((row) => {
    const rowTheme = normalizeName(row?.outputTheme || row?.theme || '');
    return rowTheme === selectedTheme;
  });

  if (!matchingRow) {
    return null;
  }

  return {
    selectedTheme,
    matchingRow
  };
}

function parseThemeLandCount(stdout, themeName) {
  if (!stdout || !themeName) {
    return null;
  }

  const escapedThemeName = String(themeName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^${escapedThemeName}: \\((?:[^,]+,\\s*){3}(\\d+) lands,`, 'im');
  const match = String(stdout).match(regex);

  if (!match) {
    return null;
  }

  const landCount = Number.parseInt(match[1], 10);
  return Number.isFinite(landCount) ? landCount : null;
}

function appendBasicLandsForSingleOutput(rows, request, stdout) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return rows;
  }

  const selection = getSingleOutputSelection(request);
  if (!selection) {
    return rows;
  }

  if (rows.some((row) => isBasicLandName(row))) {
    return rows;
  }

  const builderMetadata = loadBuilderMetadataFromFile();
  const commanderKey = normalizeName(selection.matchingRow.primaryCommander || '');
  const themeKey = normalizeName(selection.matchingRow.outputTheme || selection.matchingRow.theme || '');
  const commanderMeta = builderMetadata.commanders?.[commanderKey];
  const themeMeta = builderMetadata.themes?.[themeKey];
  const colorIdentity = String(commanderMeta?.color || '').trim();

  if (!colorIdentity) {
    return rows;
  }

  const basicLandNames = BASIC_LANDS
    .filter(({ color }) => colorIdentity.includes(color))
    .map(({ name }) => name);

  if (basicLandNames.length === 0) {
    return rows;
  }

  const totalDesiredLands = Number.isFinite(themeMeta?.totalLandCount)
    ? themeMeta.totalLandCount
    : 38;
  const currentLandCount = parseThemeLandCount(stdout, selection.matchingRow.theme || selection.matchingRow.outputTheme || '');

  if (!Number.isFinite(currentLandCount) || currentLandCount >= totalDesiredLands) {
    return rows;
  }

  let landsToAdd = Math.floor((totalDesiredLands - currentLandCount) / basicLandNames.length);
  if (landsToAdd < 1) {
    landsToAdd = 1;
  }

  return rows.concat(basicLandNames.map((name) => `${landsToAdd} ${name}`));
}

function finalizeDisplayRows(rows, request, stdout = '') {
  return appendBasicLandsForSingleOutput(rows, request, stdout);
}

function buildMissingBasicRows(request, stdout = '') {
  const selection = getSingleOutputSelection(request);
  if (!selection) {
    return [];
  }

  const builderMetadata = loadBuilderMetadataFromFile();
  const commanderKey = normalizeName(selection.matchingRow.primaryCommander || '');
  const themeKey = normalizeName(selection.matchingRow.outputTheme || selection.matchingRow.theme || '');
  const commanderMeta = builderMetadata.commanders?.[commanderKey];
  const themeMeta = builderMetadata.themes?.[themeKey];
  const colorIdentity = String(commanderMeta?.color || '').trim();

  if (!colorIdentity) {
    return [];
  }

  const basicLandNames = BASIC_LANDS
    .filter(({ color }) => colorIdentity.includes(color))
    .map(({ name }) => name);

  if (basicLandNames.length === 0) {
    return [];
  }

  const totalDesiredLands = Number.isFinite(themeMeta?.totalLandCount)
    ? themeMeta.totalLandCount
    : 38;
  const currentLandCount = parseThemeLandCount(stdout, selection.matchingRow.theme || selection.matchingRow.outputTheme || '');

  if (!Number.isFinite(currentLandCount) || currentLandCount >= totalDesiredLands) {
    return [];
  }

  let landsToAdd = Math.floor((totalDesiredLands - currentLandCount) / basicLandNames.length);
  if (landsToAdd < 1) {
    landsToAdd = 1;
  }

  return basicLandNames.map((name) => `${landsToAdd} ${name}`);
}

function readRequestedDeckRows(request, stdout = '') {
  const selection = getSingleOutputSelection(request);
  const isSingleOutputTheme = Boolean(selection) && (request?.validRows || []).length === 1;

  const sourcePath = isSingleOutputTheme
    ? path.join(projectRoot, 'outputs', 'combinedDeckOutput.csv')
    : path.join(projectRoot, 'outputs', 'cubeOutput_deduped.csv');

  if (!fs.existsSync(sourcePath)) {
    return [];
  }

  const csvText = fs.readFileSync(sourcePath, 'utf8');
  const rawRows = parse(csvText, {
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    bom: true
  });

  if (isSingleOutputTheme) {
    const singleCommander = normalizeName(selection?.matchingRow?.primaryCommander || '');

    if (!singleCommander) {
      return [];
    }

    const displayRows = rawRows
      .filter((row) => Array.isArray(row) && row.length > 1)
      .filter((row) => normalizeName(row[0]) === singleCommander)
      .map((row) => sanitizeCardName(row[1]))
      .filter(Boolean);

    return appendBasicLandsForSingleOutput(displayRows, request, stdout);
  }

  const filteredRows = filterRowsForRequest(rawRows, request);

  const displayRows = filteredRows
    .slice(1)
    .map((row) => {
      const name = sanitizeCardName(row[0]);
      const setCode = sanitizeCardName(row[1]);

      if (!name || isBasicLandName(name)) {
        return '';
      }

      return setCode ? `${name} (${setCode})` : name;
    })
    .filter(Boolean);

  return appendBasicLandsForSingleOutput(displayRows, request, stdout);
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'Deck builder web app is running.' });
});

app.get('/api/metadata', (req, res) => {
  const metadata = buildUiMetadata();
  res.json({ ok: true, ...metadata });
});

app.post('/api/build-deck', (req, res) => {
  const config = resolveDeckConfig(req.body);

  if (config.warnings.length > 0) {
    return res.status(400).json({
      ok: false,
      warnings: config.warnings,
      validRows: config.validRows,
      request: req.body
    });
  }

  execFile(
    process.execPath,
    [legacyBuilderPath],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        DECK_GROUP: config.selectedGroup,
        DECK_COMMANDER: config.selectedCommander,
        WEB_CONFIG: JSON.stringify(config.builderConfig || {})
      }
    },
    async (error, stdout, stderr) => {
      if (error) {
        return res.status(500).json({
          ok: false,
          error: error.message,
          stderr: stderr || stdout || ''
        });
      }

      try {
        const requestedRows = readRequestedDeckRows(config, stdout);
        let archidektRows = finalizeDisplayRows(requestedRows, config, stdout);

        if (config.selectedOutputThemes.length === 1 && !archidektRows.some((row) => isBasicLandName(row))) {
          archidektRows = archidektRows.concat(buildMissingBasicRows(config, stdout));
        }

        const filteredCsv = archidektRows.join('\n');

        return res.json({
          ok: true,
          request: {
            rows: config.validRows,
            selectedGroup: config.selectedGroup,
            selectedCommander: config.selectedCommander,
            targetCommanders: config.targetCommanders,
            targetThemes: config.targetThemes,
            selectedOutputThemes: config.selectedOutputThemes
          },
          message: 'Deck build completed using the existing project builder.',
          stdout: stdout.trim(),
          rows: archidektRows,
          filteredCsv,
          outputCsvPath
        });
      } catch (readError) {
        return res.status(500).json({
          ok: false,
          error: readError.message,
          stderr: stderr || stdout || ''
        });
      }
    }
  );
});

app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Deck builder web app running at http://localhost:${PORT}`);
});
