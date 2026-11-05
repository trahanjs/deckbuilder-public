// Run from the repo root:
// node cubeAndDeckBuilder

// @ts-nocheck
'use strict';
const fs = require('fs');
const { parse } = require('csv-parse');
const { normalizeName } = require('./shared/name_normalize');
const deckBuilderCoreService = require('./services/deckBuilderCoreService');

/**

@typedef {Object} CommanderMeta
@property {string} theme
@property {string} color
@property {number} creature
@property {number} commPriority
@property {number} deckMultiplier
*/
/**

@typedef {Object} CardCollectionEntry
@property {string} set
@property {string} number
@property {string} rarity
@property {string} status
*/
/**

@typedef {Object} CardEntry
@property {string} name
@property {string} theme
@property {number} count
@property {string} type
@property {string|number} inclusion
@property {string} commander
*/
/**

@typedef {Object} CommanderObject
@property {string} commander
@property {string} theme
@property {string} color
@property {number} count
@property {number} creatureCount
@property {number} landCount
@property {boolean} trackRarity
@property {number} commPriority
*/
/**

@typedef {Object} CommObj
@property {string} commander
@property {number} inclusion
@property {number} modularCount
@property {string} modularTheme
@property {number} commPriority
@property {string} type
*/
/**

@typedef {Object} CardMapBEntry
@property {CommObj[]} commanderObjects
@property {string} [type]
*/
/**

@typedef {Object} CommandMapEntry
@property {number} count
@property {number} lands
*/
/**

@typedef {string[]} CSVRecord
*/
/**

CRITICAL DESIGN NOTE: Cross-Theme Card Processing
This deck builder processes ALL cards from ALL themes in the selectedGroup,
even when building single decks (selectedCommander: "single"). This is
INTENTIONAL BEHAVIOR that affects final deck composition through:
Shared card calculations (cards appearing across multiple themes)
Remaining card allocation after primary cards are selected
Cross-theme synergies and deck balance considerations
For example, when building a Meren deck with { selectedGroup: "eightSmall",
selectedCommander: "single" }, cards from Stella's theme ("Flurry") are
processed and may be assigned to Meren if they meet shared/remaining criteria.
DO NOT modify this behavior - it is core to the deck building algorithm.
*/
//let file = __dirname + '/inputFiles/aa_avatarInput.csv';
// Prefer formatted batch file if present to avoid parsing mismatches
let file = __dirname + '/inputFiles/aa_fullInput.csv';
const formattedBatch = __dirname + '/inputFiles/aa_fullinput_formatted_batch.csv';
if (fs.existsSync(formattedBatch)) {
    console.log('INFO: using formatted batch CSV:', formattedBatch);
    file = formattedBatch;
}
let raw;

let cardCopyMap;

// Load card collection
let collectionFile = __dirname + '/cardDataBase/cardcollection.csv';
let rawCollection;
let cardCollectionMap = {};
cardCopyMap = new Map();
try {
rawCollection = fs.readFileSync(collectionFile, 'utf8');
parse(rawCollection, {
trim: true,
skip_empty_lines: true,
columns: false,
relax_quotes: true
}, (err, records) => {
if (err) {
console.error("Error parsing collection CSV:", err);
return;
}

    const getDefaultCopiesFromStatus = (status) => {
        const normalizedStatus = normalize(status);
        return normalizedStatus === 'not owned' ? 0 : 1;
    };

    records.forEach((record) => {
        if (record.length >= 6) {
            // New format: name, type, set, number, rarity, status, copies
            const [name, typeFromCollection, set, number, rarity, status, copiesRaw] = record;
            let copies = getDefaultCopiesFromStatus(status);
            if (copiesRaw !== undefined && String(copiesRaw).trim() !== '') {
                const parsedCopies = parseInt(String(copiesRaw).trim(), 10);
                if (Number.isFinite(parsedCopies) && parsedCopies >= 0) {
                    copies = parsedCopies;
                }
            }

            // Handle "//" in name - store both full name and truncated version
            if (name.includes(' //')) {
                const truncatedName = name.split(' //')[0];
                const truncatedKey = normalize(truncatedName);
                cardCollectionMap[truncatedKey] = { type: typeFromCollection || '', set, number, rarity, status, copies };
                const existingTruncatedCopies = cardCopyMap.get(truncatedKey) ?? 0;
                if (copies > existingTruncatedCopies) {
                    cardCopyMap.set(truncatedKey, copies);
                }
            }

            const nameKey = normalize(name);
            cardCollectionMap[nameKey] = { type: typeFromCollection || '', set, number, rarity, status, copies };
            const existingCopies = cardCopyMap.get(nameKey) ?? 0;
            if (copies > existingCopies) {
                cardCopyMap.set(nameKey, copies);
            }
        }
    });
});
} catch (e) {
// If file doesn't exist, just skip
cardCollectionMap = {};
}

// Load card types (optional cache produced by scryfall_populate_types.js)
let cardTypesFile = __dirname + '/cardDataBase/cardtypes.csv';
let cardTypeMap = {};
try {
    if (fs.existsSync(cardTypesFile)) {
        const rawTypes = fs.readFileSync(cardTypesFile, 'utf8');
        const lines = rawTypes.split(/\r?\n/).filter(Boolean);
        // skip header
        for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(/,(.+)/);
            // parts[0] = name (possibly quoted), parts[1] = rest
            if (!parts[0]) continue;
            const name = parts[0].replace(/^"|"$/g, '').replace(/""/g, '"').trim();
            const rest = parts[1] || '';
            const type = rest.split(',')[0] || '';
            if (name) cardTypeMap[normalize(name)] = type;
        }
        console.log('INFO: loaded', Object.keys(cardTypeMap).length, 'card types from', cardTypesFile);
    }
} catch (e) {
    console.error('WARN: failed to load card types', e.message);
}

// Normalization function for robust string comparison
function normalize(str) {
return normalizeName(str);
}

const {
    TOTAL_DECK_COUNT,
    TOTAL_LAND_COUNT,
    BASIC_LAND_MINIMUM,
    SMALL_MULT,
    LARGE_MULT,
    MAX_MULT,
    NO_MULT,
    LAND_INCLUSION_LIMIT,
    SHARED_INCLUSION_MIN,
    SINGLE_INCLUSION_MIN,
    DUPLICATE_RECOMMENDATION_MIN_INCLUSION,
    RESERVED_CREATURE_SLOTS,
    RESERVED_NONCREATURE_SLOTS,
    BASIC_LANDS,
    NEW_CARD_SETS,
    BOOST_PERCENT,
    COMMANDER_META,
    THEME_CONFIG,
    BUILDER_DEFAULT_COMMANDER_SETS,
    BUILDER_DEFAULT_OUT_COMMANDER_LIST,
    BUILDER_DEFAULT_CONFIGURATION_SETS
} = require('./builderConfig');

let allowLandDuplicates = true;

try {
raw = fs.readFileSync(file, 'utf8');
} catch (e) {
console.error("Error loading input files:", e.message);
process.exit(1);
}

let webConfigOverride = {};
try {
    if (process.env.WEB_CONFIG) {
        webConfigOverride = JSON.parse(process.env.WEB_CONFIG);
    }
} catch (error) {
    webConfigOverride = {};
}

const COMMANDER_SETS = webConfigOverride.commanderSets || BUILDER_DEFAULT_COMMANDER_SETS;
const OUT_COMMANDER_LIST = webConfigOverride.outCommanderList || BUILDER_DEFAULT_OUT_COMMANDER_LIST;
const DEFAULT_CONFIGURATION_SETS = webConfigOverride.defaultConfigurations || BUILDER_DEFAULT_CONFIGURATION_SETS;
const BUILDER_METADATA_FILE = __dirname + '/outputs/builder_metadata.json';
deckBuilderCoreService.writeBuilderMetadataFile({
    outputDir: __dirname + '/outputs',
    metadataFile: BUILDER_METADATA_FILE,
    commanderMeta: COMMANDER_META,
    themeConfig: THEME_CONFIG,
    commanderSets: COMMANDER_SETS,
    outCommanderList: OUT_COMMANDER_LIST,
    defaultConfigurationSets: DEFAULT_CONFIGURATION_SETS,
    normalize
});

const requestedGroup = process.env.DECK_GROUP || null;
const requestedCommander = process.env.DECK_COMMANDER || null;

const CONFIGURATION_SETS = requestedGroup || requestedCommander
    ? [{
        selectedGroup: requestedGroup || 'primary',
        selectedCommander: requestedCommander || 'primary'
      }]
    : DEFAULT_CONFIGURATION_SETS;

let directToCube = !(
    CONFIGURATION_SETS.length === 1 &&
    CONFIGURATION_SETS[0] &&
    CONFIGURATION_SETS[0].selectedCommander === 'single'
);
let cubeMaybeboard = false; // If true, allow maybeboard rows in direct-to-cube output.
if (typeof process.env.CUBE_MAYBEBOARD === 'string') {
    cubeMaybeboard = process.env.CUBE_MAYBEBOARD.trim().toLowerCase() === 'true';
}
let simplifiedOutput = !directToCube; // If true, writes only column index 1 to combinedDeckOutput.csv for easy Archidekt paste.
if (typeof process.env.SIMPLIFIED_OUTPUT === 'string') {
    simplifiedOutput = process.env.SIMPLIFIED_OUTPUT.trim().toLowerCase() === 'true';
}
let includeMaybeboardBuffer = true; // If true, adds extra maybeboard buffer cards after main deck construction.
let ownedMaybeboardBufferCount = 10; // Minimum number of extra owned/accepted maybeboard cards to add per theme.
let maybeboardInclusionThreshold = 17.5; // Only add maybeboard cards with inclusion at or above this value, unless we still need the 10-card minimum.
if (typeof process.env.INCLUDE_MAYBEBOARD_BUFFER === 'string') {
    includeMaybeboardBuffer = process.env.INCLUDE_MAYBEBOARD_BUFFER.trim().toLowerCase() === 'true';
}
if (typeof process.env.OWNED_MAYBEBOARD_BUFFER === 'string') {
    includeMaybeboardBuffer = process.env.OWNED_MAYBEBOARD_BUFFER.trim().toLowerCase() === 'true';
}
if (typeof process.env.OWNED_MAYBEBOARD_BUFFER_COUNT === 'string') {
    const parsedBufferCount = parseInt(process.env.OWNED_MAYBEBOARD_BUFFER_COUNT.trim(), 10);
    if (Number.isFinite(parsedBufferCount) && parsedBufferCount >= 0) {
        ownedMaybeboardBufferCount = parsedBufferCount;
    }
}
if (typeof process.env.MAYBEBOARD_INCLUSION_THRESHOLD === 'string') {
    const parsedThreshold = parseFloat(process.env.MAYBEBOARD_INCLUSION_THRESHOLD.trim());
    if (Number.isFinite(parsedThreshold) && parsedThreshold >= 0) {
        maybeboardInclusionThreshold = parsedThreshold;
    }
}
// let deckSizeMultiplier = SMALL_MULT; // NO_MULT, SMALL_MULT, LARGE_MULT, MAX_MULT. Deck size multiplier for extended decks. Default 1.0 (no extension) - now per-commander
let cheapDecks = false; // Sets deck size to 60 for more streamlined deck. Default false.
let optimizeDecks = false; // Allows all cards in all decks, ignoring duplication. Default false.
let ignorePriority = false; // Treats all commanders in group as priority 1. Default false.
let cheapCommonOnly = false; // Forces full deck of common/uncommon cards (intended for 59). Default false.
let boostInstants = false; // Boost instant cards by BOOST_PERCENT, similar to new-card set bonuses. Default false.
let useCommanderAsTag = true; // If true, uses commander name as tag instead of theme. Default false.
let flexibleLandAssignment = false; // If true, allows lands from any commander in theme. If false, only primary commander. Default true.

// Helper function to get commander for theme based on role
function getCommanderForTheme(selectedGroup, theme, commanderRole = 'primary') {
return deckBuilderCoreService.getCommanderForTheme(COMMANDER_SETS, selectedGroup, theme, commanderRole);
}

// Utility: Get the theme for a commander in a given group
function getCommanderTheme(selectedGroup, commander) {
return deckBuilderCoreService.getCommanderTheme(COMMANDER_SETS, COMMANDER_META, selectedGroup, commander);
}

// Helper function to check if a commander is secondary in its own theme
function isSecondaryCommander(selectedGroup, commander) {
return deckBuilderCoreService.isSecondaryCommander(COMMANDER_SETS, COMMANDER_META, selectedGroup, commander);
}

// Function to process a single configuration
function processConfiguration(selectedGroup, selectedCommander, configIndex, totalConfigs, commanderRole = 'primary') {
return new Promise((resolve, reject) => {
console.log(`\n=== Processing Configuration ${configIndex + 1}/${totalConfigs}: Group="${selectedGroup}", Commander="${selectedCommander}", Role="${commanderRole}" ===`);

    const produceOutCommander = true;

    const outCommander = deckBuilderCoreService.buildOutCommanderList({
        selectedCommander,
        outCommanderList: OUT_COMMANDER_LIST,
        commanderMeta: COMMANDER_META,
        totalDeckCount: TOTAL_DECK_COUNT,
        totalLandCount: TOTAL_LAND_COUNT
    });

// Process the raw data for this configuration
parse(raw, {
    trim: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true
}, function(err, lines) {
    if (err) {
        console.error("Error parsing CSV:", err.message);
        process.exit(1);
    }

    const preprocessingResult = deckBuilderCoreService.buildCardsMapForConfiguration({
        lines,
        selectedGroup,
        getCommanderTheme,
        getCommanderForTheme,
        commanderMeta: COMMANDER_META,
        normalize,
        cheapDecks,
        cheapCommonOnly,
        cardCollectionMap,
        cardTypeMap,
        newCardSets: NEW_CARD_SETS,
        boostPercent: BOOST_PERCENT,
        singleInclusionMin: SINGLE_INCLUSION_MIN,
        boostInstants
    });
    const cardsMapA = preprocessingResult.cardsMapA;
    const missingCollectionAudit = preprocessingResult.missingCollectionAudit;

const mapBuildResult = deckBuilderCoreService.buildCardMapsAndPrimeOutput(cardsMapA, {
    COMMANDER_META,
    ignorePriority,
    COMMANDER_SETS,
    selectedGroup,
    getCommanderForTheme,
    allowLandDuplicates
});
const cardsMapB = mapBuildResult.cardsMapB;
const primeCardOutput = mapBuildResult.primeCardOutput;

// Shared function to update card status and log assignments
function updateCardStatus(cardName, commander, newStatus, reason, themeName) {
    void reason;
    void themeName;
    deckBuilderCoreService.updateCardStatus(primeCardOutput, cardName, commander, newStatus);
}

// Priority-aware sorting function for cards
function sortByPriorityAndInclusion(cards, cardIndices) {
    return deckBuilderCoreService.sortByPriorityAndInclusion(cards, cardIndices, {
        COMMANDER_META,
        ignorePriority
    });
}

const finalOutputResult = createFinalOutput();
const finalCardOutput = finalOutputResult.output;
const missingCount = finalOutputResult.missingCardCount;

function createFinalOutput() {
    const outputState = deckBuilderCoreService.initializeFinalOutputState(directToCube);
    const duplicateNeededLog = outputState.duplicateNeededLog;
    const duplicateNeededCards = outputState.duplicateNeededCards;
    const cardIndices = outputState.cardIndices;
    let output = outputState.output;
    let missingCardCount = outputState.missingCardCount;
    const typeWarnings = outputState.typeWarnings;
    const missingCards = outputState.missingCards;
    const SUPPORTED_TYPES = outputState.supportedTypes;
    const BASIC_LAND_NAME_SET = outputState.basicLandNameSet;
    const logRejection = outputState.logRejection;

    const themeData = deckBuilderCoreService.buildThemeProcessingData({
        COMMANDER_SETS,
        selectedGroup,
        getCommanderForTheme,
        commanderRole,
        COMMANDER_META,
        THEME_CONFIG,
        TOTAL_LAND_COUNT,
        TOTAL_DECK_COUNT,
        BASIC_LAND_MINIMUM,
        ignorePriority
    }).themeData;
    
    // Track card usage across themes for duplicate control
    const cardThemeUsage = new Map(); // Map<cardName, Set<themeName>>
    const cardProcessed = new Map(); // Map<cardName, Set<themeName>> - tracks ALL processed cards (main + maybeboard)
    
    // Global duplicate prevention - tracks cards added to specific commander/board combinations
    // This prevents the same card from being added multiple times to the same commander's
    // main deck or maybeboard, which was causing the 9 duplicate cards issue
    const globalCardTracker = new Map(); // Map<cardName, Map<commander, Set<boardType>>>

    function logDuplicateRecommendation(cardName, blockedFor, blockedInclusion, phase, themeName) {
        deckBuilderCoreService.logDuplicateRecommendation({
            cardName,
            blockedFor,
            blockedInclusion,
            phase,
            themeName,
            normalize,
            globalCardTracker,
            duplicateNeededCards,
            cardCopyMap,
            duplicateNeededLog,
            minInclusion: DUPLICATE_RECOMMENDATION_MIN_INCLUSION
        });
    }

    function getMaxCopies(cardName) {
        return deckBuilderCoreService.getMaxCopiesForCard({
            cardName,
            cardCopyMap,
            normalize,
            getCollectionStatus
        });
    }
    
    // Function to safely add card to output with duplicate protection
    function safeAddToOutput(card, board, themeName, theme, overrideCommander = null) {
        return deckBuilderCoreService.safeAddToOutput({
            card,
            board,
            themeName,
            theme,
            overrideCommander,
            cardIndices,
            directToCube,
            cubeMaybeboard,
            globalCardTracker,
            updateCardStatus,
            formatOutputCard,
            output,
            cardProcessed
        });
    }
    
    deckBuilderCoreService.runCardSelectionPhases({
        primeCardOutput,
        cardIndices,
        COMMANDER_META,
        getCommanderTheme,
        selectedGroup,
        COMMANDER_SETS,
        LAND_INCLUSION_LIMIT,
        sortByPriorityAndInclusion,
        cardThemeUsage,
        cardProcessed,
        getMaxCopies,
        themeData,
        cardsMapB,
        flexibleLandAssignment,
        globalCardTracker,
        ignorePriority,
        updateCardStatus,
        logRejection,
        logDuplicateRecommendation,
        getCollectionStatus,
        safeAddToOutput,
        SHARED_INCLUSION_MIN,
        THEME_CONFIG,
        RESERVED_CREATURE_SLOTS,
        RESERVED_NONCREATURE_SLOTS,
        getCardRarity,
        SINGLE_INCLUSION_MIN,
        directToCube,
        cubeMaybeboard,
        includeMaybeboardBuffer,
        ownedMaybeboardBufferCount,
        outCommander,
        maybeboardInclusionThreshold
    });

        // ...existing code...

    output = deckBuilderCoreService.applyOutCommanderFiltering({
        output,
        produceOutCommander,
        outCommander,
        directToCube,
        useCommanderAsTag
    });

    // Run final duplicate validation before output
    deckBuilderCoreService.validateNoDuplicatesInOutput(output, directToCube);
    

    
    function formatOutputCard(card, board, theme = null, overrideCommander = null) {
        const {
            formattedCard,
            typeWarningEntry,
            missingCardEntry,
            isUnsupportedType
        } = deckBuilderCoreService.formatOutputCard({
            card,
            board,
            theme,
            overrideCommander,
            cardIndices,
            directToCube,
            basicLandNameSet: BASIC_LAND_NAME_SET,
            supportedTypes: SUPPORTED_TYPES,
            getCollectionStatus
        });

        if (typeWarningEntry) {
            typeWarnings.push(typeWarningEntry);
            console.warn('WARN: unsupported card type for', typeWarningEntry.name, 'type=', typeWarningEntry.type || '<empty>');
        }

        if (missingCardEntry) {
            missingCardCount++;
            missingCards.push(missingCardEntry);
        }

        return formattedCard;
    }

    output = deckBuilderCoreService.finalizeOutputArtifacts({
        output,
        produceOutCommander,
        outCommander,
        directToCube,
        themeData,
        BASIC_LANDS,
        cheapDecks,
        useCommanderAsTag,
        duplicateNeededLog,
        outputDir: __dirname + '/outputs',
        missingCollectionAudit,
        typeWarnings,
        missingCards
    });

    // Removed writing of card_rejections.csv
    // Removed writing of deckOutput_*, primeOutput_*, and .txt outputs
    return { output, missingCardCount };
}
// Helper to get collection, status, intend, ownedOrBuy for a card name

function getCollectionStatus(cardName) {
    return deckBuilderCoreService.getCollectionStatus(cardCollectionMap, normalize, cardName);
}

// Removed getCollectionCategory: no longer needed since 'category' is not present.

function getCardRarity(cardName) {
    return deckBuilderCoreService.getCardRarity(cardCollectionMap, normalize, cardName);
}

// Keep config name for summary/debug context
const configName = `${selectedGroup}_${selectedCommander}`;

// ===== 3. MISSING CARDS REPORT SECTION =====
console.log(`Cards marked as 'Missing' in output: ${missingCount}`);

resolve({ finalCardOutput, primeCardOutput, missingCount, configName });
}); // Close the parse() callback function
}); // Close the Promise constructor
} // Close the processConfiguration function

// Main execution: Process all configurations
async function runAllConfigurations() {
    deckBuilderCoreService.logConfigurationPlan(CONFIGURATION_SETS);

    const outputDir = __dirname + "/outputs";
    const combinedOutputFile = `${outputDir}/combinedDeckOutput.csv`;
    await deckBuilderCoreService.runMultiConfigurationBuild({
        configurationSets: CONFIGURATION_SETS,
        processConfiguration,
        outputDir,
        combinedOutputFile,
        directToCube,
        simplifiedOutput,
        cwd: __dirname,
        nodePath: process.execPath
    });

    return Promise.resolve();
}

runAllConfigurations().catch(console.error);
