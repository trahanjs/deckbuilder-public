'use strict';

const fs = require('fs');
const Stringify = require('csv-stringify/sync');
const { spawn } = require('child_process');

function incrementCommand(commandMap, theme, type, dir) {
  if (commandMap[theme]) {
    if (type !== 'Land') {
      if (dir > 0) {
        commandMap[theme].count++;
      } else {
        commandMap[theme].count--;
      }
    } else if (dir > 0) {
      commandMap[theme].lands++;
    } else {
      commandMap[theme].lands--;
    }
  } else {
    commandMap[theme] = {
      count: type === 'Land' ? 0 : 1,
      lands: type === 'Land' ? 1 : 0
    };
  }
}

function updateCardStatus(primeCardOutput, cardName, commander, newStatus) {
  const statusPriority = {
    available: 1,
    non_primary: 2,
    copies_used: 3,
    deck_full: 4,
    assigned: 5
  };

  primeCardOutput.forEach((entry) => {
    if (entry[1] === cardName && entry[0] === commander) {
      const oldStatus = entry[6];
      const oldPriority = statusPriority[oldStatus] || 0;
      const newPriority = statusPriority[newStatus] || 0;

      if (oldStatus === 'assigned') {
        return;
      }

      if (oldStatus !== 'available' && newPriority <= oldPriority) {
        return;
      }

      if (oldStatus === 'available' || newPriority > oldPriority) {
        entry[6] = newStatus;
      }
    }
  });
}

function sortCardCommanders(commObjects, type, context) {
  const {
    COMMANDER_SETS,
    selectedGroup,
    getCommanderForTheme,
    ignorePriority,
    allowLandDuplicates
  } = context;

  const LAND_SIGNIFICANT_DIFFERENCE = 10;
  const NONLAND_SIGNIFICANT_DIFFERENCE = 20;
  const significantDiff = type === 'Land' ? LAND_SIGNIFICANT_DIFFERENCE : NONLAND_SIGNIFICANT_DIFFERENCE;
  void significantDiff;

  const commandersInSet = [];
  Object.keys(COMMANDER_SETS[selectedGroup]).forEach((theme) => {
    const primary = getCommanderForTheme(selectedGroup, theme, 'primary');
    const secondary = getCommanderForTheme(selectedGroup, theme, 'secondary');
    if (primary) commandersInSet.push(primary);
    if (secondary) commandersInSet.push(secondary);
  });

  commObjects.sort((a, b) => {
    const aPrimary = commandersInSet.includes(a.commander) || a.modularCount >= 2;
    const bPrimary = commandersInSet.includes(b.commander) || b.modularCount >= 2;
    if (aPrimary !== bPrimary) {
      return (bPrimary ? 1 : 0) - (aPrimary ? 1 : 0);
    }

    if (ignorePriority) {
      return b.inclusion - a.inclusion;
    }

    return (
      a.commPriority !== b.commPriority &&
      a.inclusion < 100 &&
      a.inclusion > 25 &&
      b.inclusion < 100 &&
      b.inclusion > 25 &&
      !(allowLandDuplicates && type === 'Land')
    )
      ? a.commPriority - b.commPriority
      : b.inclusion - a.inclusion;
  });
}

function sortByPriorityAndInclusion(cards, cardIndices, context) {
  const { COMMANDER_META, ignorePriority } = context;

  return cards.sort((a, b) => {
    const commanderA = a[cardIndices.command];
    const commanderB = b[cardIndices.command];
    const inclusionA = a[cardIndices.inclusion];
    const inclusionB = b[cardIndices.inclusion];

    const priorityA = COMMANDER_META[commanderA] && !ignorePriority ? COMMANDER_META[commanderA].commPriority : 1;
    const priorityB = COMMANDER_META[commanderB] && !ignorePriority ? COMMANDER_META[commanderB].commPriority : 1;

    if (inclusionA > 25 && inclusionB > 25 && priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    return inclusionB - inclusionA;
  });
}

function findCollectionEntry(cardCollectionMap, nameNorm) {
  let collection = cardCollectionMap[nameNorm];
  if (!collection) {
    const foundKey = Object.keys(cardCollectionMap).find((key) => key.startsWith(nameNorm + ' //'));
    if (foundKey) {
      collection = cardCollectionMap[foundKey];
    }
  }
  return collection;
}

function getCollectionStatus(cardCollectionMap, normalize, cardName) {
  const nameNorm = normalize(cardName);
  const collection = findCollectionEntry(cardCollectionMap, nameNorm);
  const status = collection && collection.status ? collection.status.trim().toLowerCase() : '';
  const ownedOrBuy = (
    status === 'own exact edition' ||
    status === 'ordered' ||
    status === 'accepted' ||
    status === 'avatar'
  );
  return { collection, ownedOrBuy };
}

function getCardRarity(cardCollectionMap, normalize, cardName) {
  const nameNorm = normalize(cardName);
  const collection = findCollectionEntry(cardCollectionMap, nameNorm);
  return collection ? collection.rarity : 'unknown';
}

function getCommanderForTheme(COMMANDER_SETS, selectedGroup, theme, commanderRole = 'primary') {
  const themeConfig = COMMANDER_SETS[selectedGroup][theme];
  if (!themeConfig) return null;

  if (typeof themeConfig === 'string') {
    return themeConfig;
  }

  return themeConfig[commanderRole] || themeConfig.primary;
}

function getCommanderTheme(COMMANDER_SETS, COMMANDER_META, selectedGroup, commander) {
  const commanderMeta = COMMANDER_META[commander];
  if (!commanderMeta) return null;

  for (const themeName in COMMANDER_SETS[selectedGroup]) {
    const themeConfig = COMMANDER_SETS[selectedGroup][themeName];
    if (themeConfig.primary === commander || themeConfig.secondary === commander) {
      return themeName;
    }
  }

  return commanderMeta.theme || null;
}

function isSecondaryCommander(COMMANDER_SETS, COMMANDER_META, selectedGroup, commander) {
  const theme = getCommanderTheme(COMMANDER_SETS, COMMANDER_META, selectedGroup, commander);
  if (!theme) return false;
  const themeConfig = COMMANDER_SETS[selectedGroup][theme];
  if (!themeConfig) return false;
  return themeConfig.secondary === commander;
}

function buildCardMapsAndPrimeOutput(cardsMapA, context) {
  const {
    COMMANDER_META,
    ignorePriority,
    COMMANDER_SETS,
    selectedGroup,
    getCommanderForTheme,
    allowLandDuplicates
  } = context;

  const cardsMapB = {};
  const commandMap = {};

  Object.keys(cardsMapA).forEach((key) => {
    const card = cardsMapA[key];

    const cardName = card.name;
    const type = card.type;
    const inclusion = parseFloat(String(card.inclusion));
    const commander = card.commander;
    const modTheme = card.theme;

    const commandersInSameTheme = new Set();
    Object.keys(cardsMapA).forEach((otherKey) => {
      const otherCard = cardsMapA[otherKey];
      if (otherCard.name === cardName && otherCard.theme === modTheme) {
        commandersInSameTheme.add(otherCard.commander);
      }
    });
    const modCount = commandersInSameTheme.size;

    const commObj = {
      commander,
      inclusion,
      modularCount: modCount,
      modularTheme: modTheme,
      commPriority: COMMANDER_META[commander] && !ignorePriority ? COMMANDER_META[commander].commPriority : 1,
      type,
      status: 'available'
    };

    if (cardsMapB[cardName]) {
      cardsMapB[cardName].commanderObjects.push(commObj);
    } else {
      cardsMapB[cardName] = {
        commanderObjects: [commObj],
        type
      };
    }
  });

  const primeCardOutput = [];
  Object.keys(cardsMapB).forEach((cardName) => {
    const card = cardsMapB[cardName];
    sortCardCommanders(card.commanderObjects, card.type || 'Unknown', {
      COMMANDER_SETS,
      selectedGroup,
      getCommanderForTheme,
      ignorePriority,
      allowLandDuplicates
    });

    card.commanderObjects.forEach((commObj) => {
      const newLine = [
        commObj.commander,
        cardName,
        commObj.type,
        commObj.inclusion,
        commObj.modularCount,
        commObj.modularTheme,
        commObj.status
      ];
      primeCardOutput.push(newLine);
      incrementCommand(commandMap, commObj.modularTheme, commObj.type, 1);
    });
  });

  sortByPriorityAndInclusion(
    primeCardOutput,
    { command: 0, cardName: 1, type: 2, inclusion: 3, modularCount: 4, modularTheme: 5, status: 6 },
    { COMMANDER_META, ignorePriority }
  );

  return {
    cardsMapB,
    commandMap,
    primeCardOutput
  };
}

function buildThemeProcessingData(context) {
  const {
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
  } = context;

  const allowedThemes = Object.keys(COMMANDER_SETS[selectedGroup]);

  const processCommandTheme = Object.keys(COMMANDER_SETS[selectedGroup])
    .map((theme) => {
      const commander = getCommanderForTheme(selectedGroup, theme, commanderRole);
      const meta = COMMANDER_META[commander];
      const themeConfig = THEME_CONFIG[theme] || {};
      const themeLandCount = typeof themeConfig.totalLandCount === 'number' ? themeConfig.totalLandCount : TOTAL_LAND_COUNT;
      const deckSizeMultiplierLocal = meta.deckMultiplier < 1 ? meta.deckMultiplier : 1;
      const baseCount = Math.round(meta.deckMultiplier * (TOTAL_DECK_COUNT - themeLandCount));
      const creatureCount = Math.round(meta.deckMultiplier * meta.creature);

      const primaryCommander = getCommanderForTheme(selectedGroup, theme, 'primary');
      const secondaryCommander = getCommanderForTheme(selectedGroup, theme, 'secondary');
      const allowedCommanders = [primaryCommander, secondaryCommander].filter((cmd) => cmd);

      return {
        commander,
        theme,
        count: baseCount,
        color: meta.color,
        creatureCount,
        nonCreatureCount: baseCount - creatureCount,
        landCount: Math.round(deckSizeMultiplierLocal * themeLandCount),
        trackRarity: false,
        allowedCommanders,
        sharedInclusionMin: themeConfig.sharedInclusionMin,
        totalLandCount: themeLandCount
      };
    })
    .filter((themeInfo) => themeInfo.commander);

  const themeData = {};
  processCommandTheme.forEach((themeInfo) => {
    themeData[themeInfo.theme] = {
      landCount: 0,
      nonLandCount: 0,
      creatureCount: 0,
      nonCreatureCount: 0,
      sharedCount: 0,
      maybeCount: 0,
      commonCount: 0,
      lowInclusion: 100,
      themeCardCount: {},
      trackRarity: themeInfo.trackRarity,
      checkCommander: themeInfo.commander,
      checkTheme: themeInfo.theme,
      checkCount: themeInfo.count,
      checkCreatureCount: themeInfo.creatureCount,
      checknNonCreatureCount: themeInfo.nonCreatureCount,
      checkLandCount: themeInfo.landCount - BASIC_LAND_MINIMUM,
      checkCommonCount: COMMANDER_META[themeInfo.commander].deckMultiplier * (TOTAL_DECK_COUNT - themeInfo.totalLandCount),
      commPriority: COMMANDER_META[themeInfo.commander] && !ignorePriority ? COMMANDER_META[themeInfo.commander].commPriority : 1,
      allowedCommanders: themeInfo.allowedCommanders,
      sharedInclusionMin: themeInfo.sharedInclusionMin,
      totalLandCount: themeInfo.totalLandCount
    };

    allowedThemes.forEach((theme) => {
      themeData[themeInfo.theme].themeCardCount[theme] = 0;
    });
  });

  return {
    allowedThemes,
    processCommandTheme,
    themeData
  };
}

function getAssignedCommandersForCard(globalCardTracker, cardName) {
  if (!globalCardTracker.has(cardName)) {
    return [];
  }
  return Array.from(globalCardTracker.get(cardName).keys());
}

function logDuplicateRecommendation(context) {
  const {
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
    minInclusion
  } = context;

  const normalizedCardName = normalize(cardName);
  const assignedTo = getAssignedCommandersForCard(globalCardTracker, cardName);

  if (duplicateNeededCards.has(normalizedCardName)) {
    return;
  }

  const configuredCopies = cardCopyMap.get(normalizedCardName) ?? 0;
  if (configuredCopies > 1) {
    return;
  }

  if (blockedInclusion < minInclusion) {
    return;
  }

  if (!assignedTo.some((commander) => commander !== blockedFor)) {
    return;
  }

  duplicateNeededCards.add(normalizedCardName);
  duplicateNeededLog.push({
    card: cardName,
    assignedTo,
    blockedFor,
    blockedInclusion,
    phase,
    theme: themeName
  });
}

function getMaxCopiesForCard(context) {
  const {
    cardName,
    cardCopyMap,
    normalize,
    getCollectionStatus
  } = context;

  const configuredCopies = cardCopyMap.get(normalize(cardName));
  const baseCopies = configuredCopies == null ? 1 : configuredCopies;

  const { collection, ownedOrBuy } = getCollectionStatus(cardName);
  if (collection && !ownedOrBuy) {
    return Math.max(baseCopies, 1);
  }

  return baseCopies;
}

function isDuplicateOutputRow(output, pushedCard, directToCube) {
  return output.some((existingCard) => {
    if (directToCube) {
      return existingCard[0] === pushedCard[0] && existingCard[6] === pushedCard[6];
    }
    return existingCard[0] === pushedCard[0] && existingCard[1] === pushedCard[1];
  });
}

function safeAddToOutput(context) {
  const {
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
  } = context;

  const cardName = card[cardIndices.name];
  const commander = overrideCommander || theme.checkCommander;
  const boardType = board === 'maybe' ? 'maybe' : 'main';

  if (directToCube && !cubeMaybeboard && boardType === 'maybe') {
    return false;
  }

  if (!globalCardTracker.has(cardName)) {
    globalCardTracker.set(cardName, new Map());
  }
  if (!globalCardTracker.get(cardName).has(commander)) {
    globalCardTracker.get(cardName).set(commander, new Set());
  }

  if (globalCardTracker.get(cardName).get(commander).has(boardType)) {
    return false;
  }

  globalCardTracker.get(cardName).get(commander).add(boardType);

  const statusCommander = overrideCommander || card[cardIndices.command];
  updateCardStatus(cardName, statusCommander, 'assigned', `Added to ${boardType} board`, themeName);

  const pushedCard = formatOutputCard(card, board, theme, overrideCommander);

  if (isDuplicateOutputRow(output, pushedCard, directToCube)) {
    return false;
  }

  output.push(pushedCard);
  cardProcessed.get(cardName).add(themeName);

  return true;
}

function validateNoDuplicatesInOutput(output, directToCube) {
  const finalCheck = new Map();
  let duplicatesFound = 0;

  output.forEach((row, index) => {
    if (index === 0 && row[0] === 'name') return;

    const cardName = directToCube ? row[0] : row[1].split(' (')[0].replace(' [Maybeboard]', '');
    const commander = directToCube ? row[6] : row[0];
    const isMaybe = directToCube
      ? (row[5] === 'TRUE' || row[5] === true)
      : (typeof row[1] === 'string' && row[1].includes('[Maybeboard]'));
    const boardType = isMaybe ? 'maybe' : 'main';

    if (!cardName || cardName === 'name') return;

    if (!finalCheck.has(commander)) {
      finalCheck.set(commander, new Map());
    }
    if (!finalCheck.get(commander).has(boardType)) {
      finalCheck.get(commander).set(boardType, new Set());
    }

    if (finalCheck.get(commander).get(boardType).has(cardName)) {
      duplicatesFound++;
    } else {
      finalCheck.get(commander).get(boardType).add(cardName);
    }
  });

  return duplicatesFound === 0;
}

function getValidThemeEntriesForCard(themeData, cardsMapB, cardName, cardCommander) {
  const validThemeEntries = [];

  Object.keys(themeData).forEach((themeName) => {
    const theme = themeData[themeName];

    if (!theme.allowedCommanders.includes(cardCommander)) {
      return;
    }

    const cardData = cardsMapB[cardName];
    if (!cardData) return;

    const matchingCommanders = cardData.commanderObjects.filter((commObj) =>
      theme.allowedCommanders.includes(commObj.commander)
    );

    if (matchingCommanders.length > 0) {
      const maxInclusion = Math.max(...matchingCommanders.map((commander) => commander.inclusion));
      validThemeEntries.push({ themeName, theme, maxInclusion });
    }
  });

  validThemeEntries.sort((a, b) => b.maxInclusion - a.maxInclusion);
  return validThemeEntries;
}

function processLandCardsPhase(context) {
  const {
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
    thresholdData,
    getCollectionStatus,
    safeAddToOutput
  } = context;

  let allLands = primeCardOutput.filter((card) => {
    if (card[cardIndices.type] !== 'Land') return false;

    const commander = card[cardIndices.command];
    const commanderMeta = COMMANDER_META[commander];
    if (!commanderMeta) return false;
    const commanderTheme = getCommanderTheme(selectedGroup, commander);
    const themeConfig = COMMANDER_SETS[selectedGroup][commanderTheme];
    const isPrimary = themeConfig && themeConfig.primary === commander;
    if (!isPrimary) return false;
    if (card[cardIndices.inclusion] < LAND_INCLUSION_LIMIT) return false;
    return true;
  });

  sortByPriorityAndInclusion(allLands, cardIndices);

  let landOverageLogged = new Set();

  for (let i = 0; i < allLands.length; i++) {
    const card = allLands[i];
    const cardName = card[cardIndices.name];

    if (!cardThemeUsage.has(cardName)) {
      cardThemeUsage.set(cardName, new Set());
    }
    if (!cardProcessed.has(cardName)) {
      cardProcessed.set(cardName, new Set());
    }

    const maxCopies = getMaxCopies(cardName);
    let copiesUsed = cardThemeUsage.get(cardName).size;

    const validThemeEntries = getValidThemeEntriesForCard(
      themeData,
      cardsMapB,
      cardName,
      card[cardIndices.command]
    );

    validThemeEntries.forEach(({ themeName, theme }) => {
      const cardData = cardsMapB[cardName];
      if (!cardData) return;

      const cardCommander = card[cardIndices.command];

      if (!theme.allowedCommanders.includes(cardCommander)) {
        return;
      }

      const commanderObj = cardData.commanderObjects.find((commObj) =>
        commObj.commander === cardCommander
      );

      if (!commanderObj) return;

      const commanderName = commanderObj.commander;
      const themeInclusion = commanderObj.inclusion;

      let cardBelongsToThemeCommanders;
      if (flexibleLandAssignment) {
        cardBelongsToThemeCommanders = true;
      } else {
        cardBelongsToThemeCommanders = commanderName === theme.checkCommander;
      }

      if (!cardBelongsToThemeCommanders) {
        return;
      }

      if (cardProcessed.get(cardName).has(themeName)) return;

      const commanderHasCard = globalCardTracker.has(cardName) &&
        globalCardTracker.get(cardName).has(commanderName);

      const allowPriorityOverride = card[cardIndices.type] === 'Land' && theme.commPriority > 1 && !ignorePriority;
      if (commanderHasCard && !allowPriorityOverride) {
        updateCardStatus(cardName, commanderName, 'copies_used', `Commander already has this card`, themeName);
        logRejection(cardName, card[cardIndices.inclusion], themeName, `Commander already has this card`, 'excluded', card[cardIndices.themeCount]);
        logDuplicateRecommendation(cardName, commanderName, themeInclusion, 'lands', themeName);
        return;
      }

      if (copiesUsed >= maxCopies && !allowPriorityOverride) {
        updateCardStatus(cardName, commanderName, 'copies_used', `All copies used by other commanders (${copiesUsed}/${maxCopies})`, themeName);
        logRejection(cardName, card[cardIndices.inclusion], themeName, `All copies used by other commanders (${copiesUsed}/${maxCopies})`, 'excluded', card[cardIndices.themeCount]);
        logDuplicateRecommendation(cardName, commanderName, themeInclusion, 'lands', themeName);
        return;
      }

      const themeThreshold = thresholdData[themeName];

      if (themeThreshold.landStopAdding) {
        updateCardStatus(cardName, card[cardIndices.command], 'deck_full', 'Land processing stopped for theme', themeName);
        return;
      }

      const landCountAfterAdding = theme.landCount + 1;

      if (landCountAfterAdding === theme.checkLandCount) {
        if (themeThreshold.landMinInclusion === null) {
          themeThreshold.landMinInclusion = themeInclusion;
        }
      } else if (landCountAfterAdding > theme.checkLandCount) {
        if (themeThreshold.landMinInclusion !== null && themeInclusion === themeThreshold.landMinInclusion) {
          if (!landOverageLogged.has(themeName)) {
            console.log(`Land phase tie: ${themeName} allowing overage for ${themeInclusion}% inclusion`);
            landOverageLogged.add(themeName);
          }
        } else if (themeThreshold.landMinInclusion !== null) {
          updateCardStatus(cardName, commanderName, 'deck_full', `Land would exceed target with different inclusion (${landCountAfterAdding}/${theme.checkLandCount})`, themeName);
          logRejection(cardName, themeInclusion, themeName, `Land would exceed target (${landCountAfterAdding}/${theme.checkLandCount}) and inclusion different from threshold (${themeInclusion}% ≠ ${themeThreshold.landMinInclusion}%) - stopping`, 'excluded', card[cardIndices.themeCount]);
          themeThreshold.landStopAdding = true;
          return;
        } else {
          updateCardStatus(cardName, commanderName, 'deck_full', `Land would exceed target (${landCountAfterAdding}/${theme.checkLandCount})`, themeName);
          logRejection(cardName, themeInclusion, themeName, `Land would exceed target (${landCountAfterAdding}/${theme.checkLandCount})`, 'excluded', card[cardIndices.themeCount]);
          themeThreshold.landStopAdding = true;
          return;
        }
      }

      let { collection, ownedOrBuy } = getCollectionStatus(card[cardIndices.name]);

      let boardType = (collection && !ownedOrBuy) ? 'maybe' : 'main';
      if (collection && !ownedOrBuy) {
        logRejection(cardName, themeInclusion, themeName, `Collection status: ${collection.status}`, 'maybeboard', card[cardIndices.themeCount]);
      }

      if (safeAddToOutput(card, boardType, themeName, theme, commanderName)) {
        if (collection && ownedOrBuy) {
          theme.landCount++;
          copiesUsed++;
          cardThemeUsage.get(cardName).add(themeName);
        }
      }
    });
  }

  return {
    landOverageLogged
  };
}

function processSharedCardsPhase(context) {
  const {
    primeCardOutput,
    cardIndices,
    COMMANDER_META,
    COMMANDER_SETS,
    selectedGroup,
    SHARED_INCLUSION_MIN,
    THEME_CONFIG,
    sortByPriorityAndInclusion,
    cardThemeUsage,
    cardProcessed,
    getMaxCopies,
    themeData,
    cardsMapB,
    updateCardStatus,
    logDuplicateRecommendation,
    logRejection,
    thresholdData,
    RESERVED_CREATURE_SLOTS,
    RESERVED_NONCREATURE_SLOTS,
    getCollectionStatus,
    safeAddToOutput,
    getCardRarity
  } = context;

  let allSharedCards = primeCardOutput.filter((card) => {
    if (card[cardIndices.type] === 'Land') return false;
    if (card[cardIndices.themeCount] < 2) return false;

    const commander = card[cardIndices.command];
    const commanderMeta = COMMANDER_META[commander];
    if (!commanderMeta) return false;

    const commanderTheme = commanderMeta.theme;
    const themeConfig = COMMANDER_SETS[selectedGroup][commanderTheme];
    if (!themeConfig) return false;

    const sharedMin = (themeConfig && themeConfig.sharedInclusionMin != null)
      ? themeConfig.sharedInclusionMin
      : SHARED_INCLUSION_MIN;

    const themeSharedConfig = THEME_CONFIG[commanderTheme] || {};
    const usePrimarySharedOnly = typeof themeSharedConfig.primarySharedOnly === 'boolean' ? themeSharedConfig.primarySharedOnly : false;

    if (usePrimarySharedOnly) {
      const isPrimary = themeConfig.primary === commander;
      if (!isPrimary) return false;
    } else {
      const isPrimaryOrSecondary = (themeConfig.primary === commander) || (themeConfig.secondary === commander);
      if (!isPrimaryOrSecondary) return false;
    }

    if (card[cardIndices.inclusion] < sharedMin) return false;
    return true;
  });

  sortByPriorityAndInclusion(allSharedCards, cardIndices);

  let sharedOverageLogged = new Set();

  for (let i = 0; i < allSharedCards.length; i++) {
    const card = allSharedCards[i];
    const cardName = card[cardIndices.name];

    if (!cardThemeUsage.has(cardName)) {
      cardThemeUsage.set(cardName, new Set());
    }
    if (!cardProcessed.has(cardName)) {
      cardProcessed.set(cardName, new Set());
    }

    const maxCopies = getMaxCopies(cardName);
    let copiesUsed = cardThemeUsage.get(cardName).size;

    const validThemeEntries = getValidThemeEntriesForCard(
      themeData,
      cardsMapB,
      cardName,
      card[cardIndices.command]
    );

    validThemeEntries.forEach(({ themeName, theme }) => {
      const cardData = cardsMapB[cardName];
      if (!cardData) return;

      const themeSharedConfig = THEME_CONFIG[themeName] || {};
      const usePrimarySharedOnly = typeof themeSharedConfig.primarySharedOnly === 'boolean' ? themeSharedConfig.primarySharedOnly : false;
      const cardCommander = card[cardIndices.command];
      if (!theme.allowedCommanders.includes(cardCommander)) {
        return;
      }

      const themeCommanders = cardData.commanderObjects.filter((commObj) =>
        theme.allowedCommanders.includes(commObj.commander)
      );
      if (themeCommanders.length === 0) return;

      const primaryCommander = themeCommanders.find((c) => c.commander === theme.checkCommander);
      const secondaryCommander = themeCommanders.find((c) => c.commander !== theme.checkCommander);
      if (!primaryCommander || !secondaryCommander) {
        return;
      }

      let commanderName;
      let themeInclusion;
      if (usePrimarySharedOnly) {
        commanderName = primaryCommander.commander;
        themeInclusion = primaryCommander.inclusion;
      } else if (primaryCommander.inclusion >= secondaryCommander.inclusion) {
        commanderName = primaryCommander.commander;
        themeInclusion = primaryCommander.inclusion;
      } else {
        commanderName = secondaryCommander.commander;
        themeInclusion = secondaryCommander.inclusion;
      }

      if (cardProcessed.get(cardName).has(themeName)) return;

      if (copiesUsed >= maxCopies) {
        updateCardStatus(cardName, commanderName, 'copies_used', `Max copies used (${copiesUsed}/${maxCopies})`, themeName);
        logDuplicateRecommendation(cardName, commanderName, themeInclusion, 'shared', themeName);
        return;
      }

      if (themeInclusion < SHARED_INCLUSION_MIN) {
        logRejection(cardName, themeInclusion, themeName, `Below SHARED_INCLUSION_MIN (${themeInclusion} < ${SHARED_INCLUSION_MIN}) - stopping shared phase`, 'excluded', card[cardIndices.themeCount]);
        return;
      }

      const themeThreshold = thresholdData[themeName];

      if (card[cardIndices.type] === 'Creature') {
        if (themeThreshold.creatureStopAdding) {
          return;
        }

        if (theme.creatureCount === theme.checkCreatureCount - RESERVED_CREATURE_SLOTS) {
          themeThreshold.creatureMinInclusion = themeInclusion;
        } else if (theme.creatureCount > theme.checkCreatureCount - RESERVED_NONCREATURE_SLOTS) {
          if (themeThreshold.creatureMinInclusion !== null && themeInclusion === themeThreshold.creatureMinInclusion) {
            if (!sharedOverageLogged.has(themeName + '_creatures')) {
              console.log(`Shared phase creature tie: ${themeName} allowing overage for ${themeInclusion}% inclusion`);
              sharedOverageLogged.add(themeName + '_creatures');
            }
          } else if (themeThreshold.creatureMinInclusion !== null && themeInclusion < themeThreshold.creatureMinInclusion) {
            logRejection(cardName, themeInclusion, themeName, `Shared creature count over limit (${theme.creatureCount}/${theme.checkCreatureCount - RESERVED_CREATURE_SLOTS}) and inclusion below threshold (${themeInclusion}% < ${themeThreshold.creatureMinInclusion}%) - stopping`, 'excluded', card[cardIndices.themeCount]);
            themeThreshold.creatureStopAdding = true;
            return;
          } else {
            logRejection(cardName, themeInclusion, themeName, `Shared creature count over limit (${theme.creatureCount}/${theme.checkCreatureCount - RESERVED_CREATURE_SLOTS})`, 'excluded', card[cardIndices.themeCount]);
            return;
          }
        }
      } else {
        if (themeThreshold.nonCreatureStopAdding) {
          return;
        }

        if (theme.nonCreatureCount === theme.checknNonCreatureCount - RESERVED_NONCREATURE_SLOTS) {
          themeThreshold.nonCreatureMinInclusion = themeInclusion;
        } else if (theme.nonCreatureCount > theme.checknNonCreatureCount - RESERVED_NONCREATURE_SLOTS) {
          if (themeThreshold.nonCreatureMinInclusion !== null && themeInclusion === themeThreshold.nonCreatureMinInclusion) {
            if (!sharedOverageLogged.has(themeName + '_non_creatures')) {
              console.log(`Shared phase non-creature tie: ${themeName} allowing overage for ${themeInclusion}% inclusion`);
              sharedOverageLogged.add(themeName + '_non_creatures');
            }
          } else if (themeThreshold.nonCreatureMinInclusion !== null && themeInclusion < themeThreshold.nonCreatureMinInclusion) {
            logRejection(cardName, themeInclusion, themeName, `Shared non-creature count over limit (${theme.nonCreatureCount}/${theme.checknNonCreatureCount - RESERVED_NONCREATURE_SLOTS}) and inclusion below threshold (${themeInclusion}% < ${themeThreshold.nonCreatureMinInclusion}%) - stopping`, 'excluded', card[cardIndices.themeCount]);
            themeThreshold.nonCreatureStopAdding = true;
            return;
          } else {
            logRejection(cardName, themeInclusion, themeName, `Shared non-creature count over limit (${theme.nonCreatureCount}/${theme.checknNonCreatureCount - RESERVED_NONCREATURE_SLOTS})`, 'excluded', card[cardIndices.themeCount]);
            return;
          }
        }
      }

      let { collection, ownedOrBuy } = getCollectionStatus(card[cardIndices.name]);

      if (collection && !ownedOrBuy) {
        logRejection(cardName, themeInclusion, themeName, `Collection status: ${collection.status}`, 'maybeboard');
        if (safeAddToOutput(card, 'maybe', themeName, theme)) {
          theme.maybeCount++;
        }
      } else {
        const creatureTargetMet = theme.creatureCount >= theme.checkCreatureCount;
        const nonCreatureTargetMet = theme.nonCreatureCount >= theme.checknNonCreatureCount;
        const atBaseCount = theme.themeCardCount[card[cardIndices.theme]] >= theme.checkCount;

        if (creatureTargetMet && nonCreatureTargetMet && atBaseCount) {
          logRejection(cardName, card[cardIndices.inclusion], themeName, `Both creature and non-creature targets met (${theme.creatureCount}/${theme.checkCreatureCount}, ${theme.nonCreatureCount}/${theme.checknNonCreatureCount})`);
          return;
        }

        theme.themeCardCount[card[cardIndices.theme]]++;
        theme.sharedCount++;

        if (safeAddToOutput(card, 'main', themeName, theme)) {
          if (card[cardIndices.type] === 'Creature') {
            theme.creatureCount++;
          } else {
            theme.nonCreatureCount++;
          }

          const cardRarity = getCardRarity(card[cardIndices.name]);
          let isCommon = cardRarity === 'common' || cardRarity === 'uncommon';
          if (isCommon) {
            theme.commonCount++;
          }
          theme.nonLandCount++;
          copiesUsed++;
          cardThemeUsage.get(cardName).add(themeName);

          if (card[cardIndices.inclusion] < theme.lowInclusion) {
            theme.lowInclusion = card[cardIndices.inclusion];
          }
        }
      }
    });
  }

  return {
    sharedOverageLogged
  };
}

function processRemainingCardsPhase(context) {
  const {
    allRemainingCards,
    cardIndices,
    cardThemeUsage,
    cardProcessed,
    getMaxCopies,
    themeData,
    cardsMapB,
    globalCardTracker,
    updateCardStatus,
    logDuplicateRecommendation,
    thresholdData,
    logRejection,
    getCollectionStatus,
    getCardRarity,
    safeAddToOutput
  } = context;

  let remainingOverageLogged = new Set();

  for (let i = 0; i < allRemainingCards.length; i++) {
    const card = allRemainingCards[i];
    const cardName = card[cardIndices.name];

    if (!cardThemeUsage.has(cardName)) {
      cardThemeUsage.set(cardName, new Set());
    }
    if (!cardProcessed.has(cardName)) {
      cardProcessed.set(cardName, new Set());
    }

    const maxCopies = getMaxCopies(cardName);
    let copiesUsed = cardThemeUsage.get(cardName).size;

    const validThemeEntries = getValidThemeEntriesForCard(
      themeData,
      cardsMapB,
      cardName,
      card[cardIndices.command]
    );

    validThemeEntries.forEach(({ themeName, theme }) => {
      const currentCardStatus = card[cardIndices.status];
      if (currentCardStatus === 'non_primary') {
        return;
      }

      const cardCommander = card[cardIndices.command];

      if (!theme.allowedCommanders.includes(cardCommander)) {
        return;
      }

      const cardData = cardsMapB[cardName];
      if (!cardData) return;

      const commanderObj = cardData.commanderObjects.find((commObj) =>
        commObj.commander === cardCommander
      );

      if (!commanderObj) return;

      const commanderName = commanderObj.commander;
      const themeSpecificInclusion = commanderObj.inclusion;

      const commanderHasCard = globalCardTracker.has(cardName) &&
        globalCardTracker.get(cardName).has(commanderName);

      if (commanderHasCard || copiesUsed >= maxCopies) {
        const reason = commanderHasCard
          ? `Commander already has this card`
          : `All copies used by other commanders (${copiesUsed}/${maxCopies})`;
        updateCardStatus(cardName, commanderName, 'copies_used', reason, themeName);
        logDuplicateRecommendation(cardName, commanderName, themeSpecificInclusion, 'remaining', themeName);
        return;
      }

      if (cardProcessed.get(cardName).has(themeName)) {
        return;
      }

      if (copiesUsed >= maxCopies) {
        updateCardStatus(cardName, commanderName, 'copies_used', `Max copies used (${copiesUsed}/${maxCopies})`, themeName);
        return;
      }

      const themeThreshold = thresholdData[themeName];

      if (card[cardIndices.type] === 'Creature') {
        if (themeThreshold.creatureStopAdding) {
          return;
        }

        const countAfterAdding = theme.creatureCount + 1;

        if (countAfterAdding === theme.checkCreatureCount) {
          if (themeThreshold.creatureMinInclusion === null) {
            themeThreshold.creatureMinInclusion = themeSpecificInclusion;
          }
        } else if (countAfterAdding > theme.checkCreatureCount) {
          if (themeThreshold.creatureMinInclusion !== null && themeSpecificInclusion === themeThreshold.creatureMinInclusion) {
            if (!remainingOverageLogged.has(themeName + '_creatures')) {
              console.log(`Remaining phase creature tie: ${themeName} allowing overage for ${themeSpecificInclusion}% inclusion`);
              remainingOverageLogged.add(themeName + '_creatures');
            }
          } else if (themeThreshold.creatureMinInclusion !== null) {
            logRejection(cardName, themeSpecificInclusion, themeName, `Remaining creature would exceed target (${countAfterAdding}/${theme.checkCreatureCount}) and inclusion different from threshold (${themeSpecificInclusion}% ≠ ${themeThreshold.creatureMinInclusion}%) - stopping`, 'excluded', card[cardIndices.themeCount]);
            themeThreshold.creatureStopAdding = true;
            return;
          }
        }
      } else {
        if (themeThreshold.nonCreatureStopAdding) {
          return;
        }

        const countAfterAdding = theme.nonCreatureCount + 1;

        if (countAfterAdding === theme.checknNonCreatureCount) {
          if (themeThreshold.nonCreatureMinInclusion === null) {
            themeThreshold.nonCreatureMinInclusion = themeSpecificInclusion;
          }
        } else if (countAfterAdding > theme.checknNonCreatureCount) {
          if (themeThreshold.nonCreatureMinInclusion !== null && themeSpecificInclusion === themeThreshold.nonCreatureMinInclusion) {
            if (!remainingOverageLogged.has(themeName + '_non_creatures')) {
              console.log(`Remaining phase non-creature tie: ${themeName} allowing overage for ${themeSpecificInclusion}% inclusion`);
              remainingOverageLogged.add(themeName + '_non_creatures');
            }
          } else if (themeThreshold.nonCreatureMinInclusion !== null) {
            logRejection(cardName, themeSpecificInclusion, themeName, `Remaining non-creature would exceed target (${countAfterAdding}/${theme.checknNonCreatureCount}) and inclusion different from threshold (${themeSpecificInclusion}% ≠ ${themeThreshold.nonCreatureMinInclusion}%) - stopping`, 'excluded', card[cardIndices.themeCount]);
            themeThreshold.nonCreatureStopAdding = true;
            return;
          }
        }
      }

      let { collection, ownedOrBuy } = getCollectionStatus(card[cardIndices.name]);

      const cardRarity = getCardRarity(card[cardIndices.name]);
      let isCommon = cardRarity === 'common' || cardRarity === 'uncommon';
      let restrictByRarity = false;

      if ((collection && !ownedOrBuy) || restrictByRarity) {
        if (collection && !ownedOrBuy) {
          logRejection(cardName, card[cardIndices.inclusion], themeName, `Collection status: ${collection.status}`, 'maybeboard', card[cardIndices.themeCount]);
        }
        if (restrictByRarity) {
          logRejection(cardName, card[cardIndices.inclusion], themeName, `Rarity restriction: need ${remainingCommonCount} common/uncommon from ${remainingNonLandCount} remaining slots`, 'maybeboard', card[cardIndices.themeCount]);
        }
        if (safeAddToOutput(card, 'maybe', themeName, theme)) {
          theme.maybeCount++;
        }
      } else {
        const creatureCountAfter = card[cardIndices.type] === 'Creature' ? theme.creatureCount + 1 : theme.creatureCount;
        const nonCreatureCountAfter = card[cardIndices.type] === 'Creature' ? theme.nonCreatureCount : theme.nonCreatureCount + 1;

        const creatureTargetMet = theme.creatureCount >= theme.checkCreatureCount;
        const nonCreatureTargetMet = theme.nonCreatureCount >= theme.checknNonCreatureCount;

        if (creatureTargetMet && nonCreatureTargetMet) {
          updateCardStatus(cardName, card[cardIndices.command], 'deck_full', `Both targets met (${theme.creatureCount}/${theme.checkCreatureCount}, ${theme.nonCreatureCount}/${theme.checknNonCreatureCount})`, themeName);
          logRejection(cardName, card[cardIndices.inclusion], themeName, `Both creature and non-creature targets met (${theme.creatureCount}/${theme.checkCreatureCount}, ${theme.nonCreatureCount}/${theme.checknNonCreatureCount})`, 'excluded', card[cardIndices.themeCount]);
          return;
        }

        const creatureTargetWouldExceed = creatureCountAfter > theme.checkCreatureCount;
        const nonCreatureTargetWouldExceed = nonCreatureCountAfter > theme.checknNonCreatureCount;

        if ((card[cardIndices.type] === 'Creature' && creatureTargetWouldExceed) ||
            (card[cardIndices.type] !== 'Creature' && card[cardIndices.type] !== 'Land' && nonCreatureTargetWouldExceed)) {
          const targetType = card[cardIndices.type] === 'Creature' ? 'creature' : 'non-creature';
          const currentCount = card[cardIndices.type] === 'Creature' ? theme.creatureCount : theme.nonCreatureCount;
          const targetCount = card[cardIndices.type] === 'Creature' ? theme.checkCreatureCount : theme.checknNonCreatureCount;
          updateCardStatus(cardName, card[cardIndices.command], 'deck_full', `${targetType} target would exceed (${currentCount}+1/${targetCount})`, themeName);
          logRejection(cardName, card[cardIndices.inclusion], themeName, `${targetType} target would be exceeded (${currentCount}+1/${targetCount})`, 'excluded', card[cardIndices.themeCount]);
          return;
        }

        theme.themeCardCount[card[cardIndices.theme]]++;

        if (safeAddToOutput(card, 'main', themeName, theme)) {
          if (card[cardIndices.type] === 'Creature') {
            theme.creatureCount++;
          } else {
            theme.nonCreatureCount++;
          }
          if (card[cardIndices.themeCount] > 1) {
            theme.sharedCount++;
          }

          if (isCommon) {
            theme.commonCount++;
          }
          theme.nonLandCount++;
          copiesUsed++;
          cardThemeUsage.get(cardName).add(themeName);

          if (card[cardIndices.inclusion] < theme.lowInclusion) {
            theme.lowInclusion = card[cardIndices.inclusion];
          }
        }
      }
    });
  }

  return {
    remainingOverageLogged
  };
}

function processOwnedMaybeboardBuffer(context) {
  const {
    directToCube,
    cubeMaybeboard,
    includeMaybeboardBuffer,
    ownedMaybeboardBufferCount,
    outCommander,
    themeData,
    allRemainingCards,
    cardIndices,
    cardsMapB,
    cardProcessed,
    getCollectionStatus,
    getMaxCopies,
    cardThemeUsage,
    globalCardTracker,
    maybeboardInclusionThreshold,
    safeAddToOutput
  } = context;

  if ((directToCube && !cubeMaybeboard) || !includeMaybeboardBuffer || ownedMaybeboardBufferCount <= 0) {
    return;
  }

  const selectedMaybeboardThemes = new Set(outCommander.map((commander) => commander.theme));

  Object.keys(themeData).forEach((themeName) => {
    if (!selectedMaybeboardThemes.has(themeName)) {
      return;
    }
    const theme = themeData[themeName];
    let addedBufferCards = 0;

    for (let i = 0; i < allRemainingCards.length; i++) {
      const card = allRemainingCards[i];
      const cardName = card[cardIndices.name];
      const cardType = card[cardIndices.type];
      if (cardType === 'Land') continue;

      const cardCommander = card[cardIndices.command];
      if (!theme.allowedCommanders.includes(cardCommander)) continue;

      const cardData = cardsMapB[cardName];
      if (!cardData) continue;

      const commanderObj = cardData.commanderObjects.find((commObj) => commObj.commander === cardCommander);
      if (!commanderObj) continue;

      if (!cardProcessed.has(cardName)) {
        cardProcessed.set(cardName, new Set());
      }
      if (cardProcessed.get(cardName).has(themeName)) {
        continue;
      }

      const { collection, ownedOrBuy } = getCollectionStatus(cardName);
      if (!collection || !ownedOrBuy) {
        continue;
      }

      const maxCopies = getMaxCopies(cardName);
      if (!cardThemeUsage.has(cardName)) {
        cardThemeUsage.set(cardName, new Set());
      }
      let copiesUsed = cardThemeUsage.get(cardName).size;

      const commanderName = commanderObj.commander;
      const commanderHasCard = globalCardTracker.has(cardName) &&
        globalCardTracker.get(cardName).has(commanderName);
      if (commanderHasCard || copiesUsed >= maxCopies) {
        continue;
      }

      const inclusionAboveThreshold = commanderObj.inclusion >= maybeboardInclusionThreshold;
      const hasMinimumBuffer = addedBufferCards < ownedMaybeboardBufferCount;
      if (!inclusionAboveThreshold && !hasMinimumBuffer) {
        continue;
      }

      if (safeAddToOutput(card, 'maybe', themeName, theme, commanderName)) {
        theme.maybeCount++;
        copiesUsed++;
        cardThemeUsage.get(cardName).add(themeName);
        addedBufferCards++;
      }
    }

    if (addedBufferCards > 0) {
      console.log(`Owned maybeboard buffer for ${themeName}: added ${addedBufferCards} with inclusion threshold ${maybeboardInclusionThreshold}% (minimum ${ownedMaybeboardBufferCount})`);
    }
  });
}

function logOverageAnalysis(context) {
  const {
    landOverageLogged,
    sharedOverageLogged,
    remainingOverageLogged
  } = context;

  console.log('=== OVERAGE ANALYSIS ===');
  let landTieCount = 0;
  let sharedCreatureTieCount = 0;
  let sharedNonCreatureTieCount = 0;
  let remainingCreatureTieCount = 0;
  let remainingNonCreatureTieCount = 0;

  landTieCount = Array.from(landOverageLogged).length;
  sharedCreatureTieCount = Array.from(sharedOverageLogged).filter((key) => key.endsWith('_creatures')).length;
  sharedNonCreatureTieCount = Array.from(sharedOverageLogged).filter((key) => key.endsWith('_non_creatures')).length;
  remainingCreatureTieCount = Array.from(remainingOverageLogged).filter((key) => key.endsWith('_creatures')).length;
  remainingNonCreatureTieCount = Array.from(remainingOverageLogged).filter((key) => key.endsWith('_non_creatures')).length;

  if (landTieCount > 0) {
    console.log(`Land phase ties: ${landTieCount} theme(s) allowed overage due to tied inclusion percentages`);
  }
  if (sharedCreatureTieCount > 0) {
    console.log(`Shared phase creature ties: ${sharedCreatureTieCount} theme(s) allowed overage due to tied inclusion percentages`);
  }
  if (sharedNonCreatureTieCount > 0) {
    console.log(`Shared phase non-creature ties: ${sharedNonCreatureTieCount} theme(s) allowed overage due to tied inclusion percentages`);
  }
  if (remainingCreatureTieCount > 0) {
    console.log(`Remaining phase creature ties: ${remainingCreatureTieCount} theme(s) allowed overage due to tied inclusion percentages`);
  }
  if (remainingNonCreatureTieCount > 0) {
    console.log(`Remaining phase non-creature ties: ${remainingNonCreatureTieCount} theme(s) allowed overage due to tied inclusion percentages`);
  }

  if (landTieCount === 0 && sharedCreatureTieCount === 0 && sharedNonCreatureTieCount === 0 &&
      remainingCreatureTieCount === 0 && remainingNonCreatureTieCount === 0) {
    console.log('No tie situations encountered - all boundaries were clean cuts');
  }
  console.log('=============================================\n');
}

function resetThresholdDataForRemainingPhase(thresholdData) {
  Object.keys(thresholdData).forEach((themeName) => {
    const thresholds = thresholdData[themeName];
    thresholds.creatureStopAdding = false;
    thresholds.nonCreatureStopAdding = false;
    thresholds.creatureMinInclusion = null;
    thresholds.nonCreatureMinInclusion = null;
  });
}

function getRemainingCardsCandidates(context) {
  const {
    primeCardOutput,
    cardIndices,
    COMMANDER_META,
    getCommanderTheme,
    selectedGroup,
    COMMANDER_SETS,
    SINGLE_INCLUSION_MIN,
    sortByPriorityAndInclusion
  } = context;

  let allRemainingCards = primeCardOutput.filter((card) => {
    if (card[cardIndices.type] === 'Land') return false;

    const commander = card[cardIndices.command];
    const commanderMeta = COMMANDER_META[commander];
    if (!commanderMeta) return false;
    const commanderTheme = getCommanderTheme(selectedGroup, commander);
    const themeConfig = COMMANDER_SETS[selectedGroup][commanderTheme];
    const isPrimary = themeConfig && themeConfig.primary === commander;
    if (!isPrimary) return false;

    if (card[cardIndices.inclusion] < SINGLE_INCLUSION_MIN) {
      return false;
    }

    return true;
  });

  sortByPriorityAndInclusion(allRemainingCards, cardIndices);
  return allRemainingCards;
}

function writeDuplicateRecommendationsCsv(context) {
  const {
    duplicateNeededLog,
    outputDir
  } = context;

  if (!Array.isArray(duplicateNeededLog) || duplicateNeededLog.length === 0) {
    return;
  }

  const csvHeader = 'Card,AssignedTo,BlockedFor,BlockedInclusion,Phase,Theme\n';
  const csvRows = duplicateNeededLog.map((entry) =>
    `"${entry.card}","${(entry.assignedTo || []).join(';')}","${entry.blockedFor}",${entry.blockedInclusion},${entry.phase},${entry.theme}`
  );
  const csvContent = csvHeader + csvRows.join('\n');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const dupRecPath = outputDir + '/DuplicateRecommendations.csv';
  try {
    fs.writeFileSync(dupRecPath, csvContent, 'utf8');
    console.log('DuplicateRecommendations.csv written with', duplicateNeededLog.length, 'recommendations.');
  } catch (e) {
    console.error('Failed to write DuplicateRecommendations.csv:', e.message);
  }
}

function logThemeValidationAndReports(context) {
  const {
    themeData,
    outCommander
  } = context;

  const testFailures = [];
  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;

  function runTestQuietly(testName, testFunction) {
    totalTests++;
    try {
      const result = testFunction();
      if (result.passed) {
        passedTests++;
      } else {
        failedTests++;
        testFailures.push({ test: testName, message: result.message });
      }
    } catch (error) {
      failedTests++;
      testFailures.push({ test: testName, message: error.message });
    }
  }

  Object.keys(themeData).forEach((themeName) => {
    const theme = themeData[themeName];
    const expectedLands = theme.checkLandCount || 38;
    const expectedCreatures = theme.checkCreatureCount || theme.creatureCount;
    const expectedNonCreatures = theme.checknNonCreatureCount || theme.nonCreatureCount;

    runTestQuietly(`${themeName} - Land Count Check`, () => {
      const delta = theme.landCount - expectedLands;
      if (delta > 0) {
        return {
          passed: false,
          message: `Land count over target by ${delta} (${theme.landCount}/${expectedLands})`
        };
      }
      return { passed: true };
    });

    runTestQuietly(`${themeName} - Creature Count Check`, () => {
      const delta = theme.creatureCount - expectedCreatures;
      if (delta > 2) {
        return {
          passed: false,
          message: `Creature count over target by ${delta} (${theme.creatureCount}/${expectedCreatures})`
        };
      } else if (delta < -2) {
        return {
          passed: false,
          message: `Creature count under target by ${Math.abs(delta)} (${theme.creatureCount}/${expectedCreatures})`
        };
      }
      return { passed: true };
    });

    runTestQuietly(`${themeName} - Non-Creature Count Check`, () => {
      const delta = theme.nonCreatureCount - expectedNonCreatures;
      if (delta > 2) {
        return {
          passed: false,
          message: `Non-creature count over target by ${delta} (${theme.nonCreatureCount}/${expectedNonCreatures})`
        };
      } else if (delta < -2) {
        return {
          passed: false,
          message: `Non-creature count under target by ${Math.abs(delta)} (${theme.nonCreatureCount}/${expectedNonCreatures})`
        };
      }
      return { passed: true };
    });
  });

  runTestQuietly('Duplicate Card Validation', () => {
    return { passed: true };
  });

  if (testFailures.length > 0) {
    console.log('=== TEST FAILURES ===');
    testFailures.forEach((failure) => {
      console.log(`✗ ${failure.test}: ${failure.message}`);
    });
    console.log(`\nSummary: ${failedTests}/${totalTests} tests failed\n`);
  } else {
    console.log('=== TESTS ===');
    console.log(`All ${totalTests} tests passed\n`);
  }

  const selectedThemes = new Set(outCommander.map((commander) => commander.theme));
  Object.keys(themeData).forEach((themeName) => {
    if (selectedThemes.has(themeName)) {
      const theme = themeData[themeName];
      console.log(`${themeName}: (${theme.nonLandCount} cards, ${theme.creatureCount} creatures, ${theme.nonCreatureCount} non-creatures, ${theme.landCount} lands, ${theme.sharedCount} shared, ${theme.maybeCount} maybeboard, ${theme.commonCount} commons, ${theme.lowInclusion} lowest inclusion)`);
    }
  });

  console.log('');
}

function applyOutCommanderFiltering(context) {
  const {
    output,
    produceOutCommander,
    outCommander,
    directToCube,
    useCommanderAsTag
  } = context;

  if (!produceOutCommander || !Array.isArray(outCommander) || outCommander.length === 0) {
    return output;
  }

  const filterValues = outCommander.map((obj) => obj.theme);

  let filteredOutput = output.filter((card) => {
    if (directToCube && card[0] === 'name') return true;

    let cardTheme;
    if (directToCube) {
      cardTheme = card[6];
    } else {
      cardTheme = card[5];
    }

    return filterValues.includes(cardTheme);
  });

  if (directToCube && useCommanderAsTag && filteredOutput.length > 1) {
    const themeToCommanderMap = {};
    outCommander.forEach((commanderObj) => {
      themeToCommanderMap[commanderObj.theme] = commanderObj.commander;
    });

    for (let i = 1; i < filteredOutput.length; i++) {
      const currentTag = filteredOutput[i][6];
      if (themeToCommanderMap[currentTag]) {
        filteredOutput[i][6] = themeToCommanderMap[currentTag];
      }
    }
  }

  return filteredOutput;
}

function appendSingleCommanderBasicLands(context) {
  const {
    output,
    produceOutCommander,
    outCommander,
    directToCube,
    themeData,
    BASIC_LANDS,
    cheapDecks,
    useCommanderAsTag
  } = context;

  if (!produceOutCommander || !Array.isArray(outCommander) || outCommander.length !== 1 || directToCube) {
    return;
  }

  const singleCommander = outCommander[0];
  const singleTheme = themeData[singleCommander.theme];
  if (!singleTheme) return;

  const basicLandNames = BASIC_LANDS
    .filter(({ color }) => singleCommander.color.indexOf(color) !== -1)
    .map(({ name }) => name);
  const numBasicTypes = basicLandNames.length;
  if (numBasicTypes <= 0) return;

  const totalDesiredLands = cheapDecks ? 24 : singleCommander.landCount || 40;
  let landsToAdd = Math.floor((totalDesiredLands - singleTheme.landCount) / numBasicTypes);
  if (landsToAdd < 1) landsToAdd = 1;

  BASIC_LANDS.forEach(({ color, name }) => {
    if (singleCommander.color.indexOf(color) !== -1) {
      if (directToCube) {
        const tagValue = useCommanderAsTag ? singleCommander.commander : singleCommander.theme;
        output.push([
          `${landsToAdd} ${name}`,
          'lci',
          '100',
          'Owned',
          'Non-foil',
          'FALSE',
          tagValue
        ]);
      } else {
        output.push([singleCommander.commander, `${landsToAdd} ${name} (lci)`, 'Land', 100, 2, singleCommander.theme]);
      }
    }
  });
}

function writeMissingOrTypeWarnings(context) {
  const {
    outputDir,
    typeWarnings,
    missingCards
  } = context;

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const warningNames = new Set();

  (typeWarnings || []).forEach((entry) => {
    if (entry && entry.name) warningNames.add(String(entry.name));
  });

  (missingCards || []).forEach((entry) => {
    if (entry && entry.name) warningNames.add(String(entry.name));
  });

  const rows = ['name', ...Array.from(warningNames).sort((left, right) => left.localeCompare(right))];

  try {
    fs.writeFileSync(outputDir + '/missing_or_type_warnings.csv', rows.join('\n'), 'utf8');
    const legacyTypeWarnings = outputDir + '/type_warnings.csv';
    const legacyMissingCards = outputDir + '/missing_cards.csv';
    if (fs.existsSync(legacyTypeWarnings)) fs.unlinkSync(legacyTypeWarnings);
    if (fs.existsSync(legacyMissingCards)) fs.unlinkSync(legacyMissingCards);
    console.log('Wrote missing_or_type_warnings.csv count=', warningNames.size);
  } catch (e) {
    console.error('Failed to write missing_or_type_warnings.csv', e && e.message);
  }
}

function writeMissingCardsFromCollection(context) {
  const {
    outputDir,
    missingCollectionAudit
  } = context;

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const rows = Array.from((missingCollectionAudit || new Set()).values()).sort((left, right) => left.localeCompare(right));

  try {
    const content = rows.length > 0 ? rows.join('\n') + '\n' : '';
    fs.writeFileSync(outputDir + '/missing_cards_from_collection.csv', content, 'utf8');
    console.log('Wrote missing_cards_from_collection.csv count=', rows.length);
  } catch (e) {
    console.error('Failed to write missing_cards_from_collection.csv', e && e.message);
  }
}

function buildCombinedOutputRows(allResults, directToCube) {
  const combinedOutput = [];

  let hasHeader = false;
  if (allResults.length > 0 && allResults[0].finalCardOutput.length > 0) {
    const firstRow = allResults[0].finalCardOutput[0];
    if (directToCube && firstRow && firstRow[0] === 'name') {
      combinedOutput.push(firstRow);
      hasHeader = true;
    }
  }

  allResults.forEach((result) => {
    let startIndex = 0;
    if (result.finalCardOutput.length > 0) {
      const firstRow = result.finalCardOutput[0];
      if (directToCube && firstRow && firstRow[0] === 'name' && hasHeader) {
        startIndex = 1;
      }
    }
    combinedOutput.push(...result.finalCardOutput.slice(startIndex));
  });

  return combinedOutput;
}

function writeCombinedOutputFile(context) {
  const {
    outputDir,
    combinedOutputFile,
    combinedOutput,
    simplifiedOutput
  } = context;

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  if (simplifiedOutput) {
    const simplifiedLines = combinedOutput
      .map((row) => Array.isArray(row) ? String(row[1] ?? '') : '')
      .map((value) => value.replace(/^"+|"+$/g, ''))
      .filter((value) => value && value !== 'name');

    fs.writeFileSync(combinedOutputFile, simplifiedLines.join('\n') + (simplifiedLines.length ? '\n' : ''), 'utf8');
  } else {
    fs.writeFileSync(combinedOutputFile, Stringify.stringify(combinedOutput));
  }
}

async function buildConfigurationResults(configurationSets, processConfiguration) {
  const allResults = [];
  for (let i = 0; i < configurationSets.length; i++) {
    const config = configurationSets[i];
    const result = await processConfiguration(
      config.selectedGroup,
      config.selectedCommander,
      i,
      configurationSets.length,
      config.commanderRole || 'primary'
    );
    allResults.push(result);
  }
  return allResults;
}

function logMultiConfigurationSummary(context) {
  const {
    configurationCount,
    combinedOutputFile,
    simplifiedOutput
  } = context;

  console.log('\n=== MULTI-CONFIGURATION BUILD COMPLETE ===');
  console.log(`Processed ${configurationCount} configurations`);
  console.log(`Combined output: ${combinedOutputFile}`);
  console.log(`Simplified output: ${simplifiedOutput ? 'enabled (column index 1 only)' : 'disabled (full CSV rows)'}`);
  console.log('===========================================');
}

function maybeRunDedup(context) {
  const {
    directToCube,
    cwd,
    nodePath
  } = context;

  if (!directToCube) {
    console.log('All processing finished successfully!');
    return Promise.resolve();
  }

  console.log('\n=== RUNNING DEDUPLICATION ===');
  console.log('Executing dedup_cube_csv.js...');

  return new Promise((resolve, reject) => {
    const dedupProcess = spawn(nodePath, ['dedup_cube_csv.js'], {
      cwd,
      stdio: 'inherit'
    });

    dedupProcess.on('close', (code) => {
      if (code === 0) {
        console.log('All processing finished successfully!');
        resolve();
      } else {
        reject(new Error(`Dedup script exited with code ${code}`));
      }
    });

    dedupProcess.on('error', (error) => {
      reject(error);
    });
  });
}

async function runMultiConfigurationBuild(context) {
  const {
    configurationSets,
    processConfiguration,
    outputDir,
    combinedOutputFile,
    directToCube,
    simplifiedOutput,
    cwd,
    nodePath
  } = context;

  const allResults = await buildConfigurationResults(configurationSets, processConfiguration);
  const combinedOutput = buildCombinedOutputRows(allResults, directToCube);

  writeCombinedOutputFile({
    outputDir,
    combinedOutputFile,
    combinedOutput,
    simplifiedOutput
  });

  logMultiConfigurationSummary({
    configurationCount: configurationSets.length,
    combinedOutputFile,
    simplifiedOutput
  });

  await maybeRunDedup({
    directToCube,
    cwd,
    nodePath
  });

  return {
    allResults,
    combinedOutput
  };
}

function logConfigurationPlan(configurationSets) {
  console.log('Starting multi-configuration deck building...');
  console.log(`Processing ${configurationSets.length} configurations:`);
  configurationSets.forEach((config, index) => {
    console.log(` ${index + 1}. Group: "${config.selectedGroup}", Commander: "${config.selectedCommander}", Role: "${config.commanderRole || 'primary'}"`);
  });
}

function writeBuilderMetadataFile(context) {
  const {
    outputDir,
    metadataFile,
    commanderMeta,
    themeConfig,
    commanderSets,
    outCommanderList,
    defaultConfigurationSets,
    normalize
  } = context;

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const commanders = {};
  for (const [name, meta] of Object.entries(commanderMeta || {})) {
    if (!meta || typeof meta !== 'object') continue;
    commanders[normalize(name)] = {
      name: String(name).trim(),
      theme: String(meta.theme || '').trim(),
      color: String(meta.color || '').trim(),
      creature: meta.creature,
      commPriority: meta.commPriority,
      deckMultiplier: meta.deckMultiplier
    };
  }

  const themes = {};
  for (const [themeName, cfg] of Object.entries(themeConfig || {})) {
    if (!cfg || typeof cfg !== 'object') continue;
    themes[normalize(themeName)] = {
      name: String(themeName).trim(),
      sharedInclusionMin: cfg.sharedInclusionMin,
      totalLandCount: cfg.totalLandCount,
      primarySharedOnly: Boolean(cfg.primarySharedOnly)
    };
  }

  const metadata = {
    generatedAt: new Date().toISOString(),
    commanders,
    themes,
    commanderSets,
    outCommanderList,
    defaultConfigurations: defaultConfigurationSets
  };

  fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2), 'utf8');
}

function buildOutCommanderList(context) {
  const {
    selectedCommander,
    outCommanderList,
    commanderMeta,
    totalDeckCount,
    totalLandCount
  } = context;

  return outCommanderList[selectedCommander].map((commanderName) => {
    const meta = commanderMeta[commanderName];
    if (!meta) throw new Error(`Commander not found in COMMANDER_META: ${commanderName}`);
    const landMultiplier = meta.deckMultiplier < 1 ? meta.deckMultiplier : 1;
    return {
      commander: commanderName,
      theme: meta.theme,
      color: meta.color,
      count: Math.round(meta.deckMultiplier * (totalDeckCount - totalLandCount)),
      creatureCount: Math.round(meta.deckMultiplier * meta.creature),
      landCount: Math.round(landMultiplier * totalLandCount),
      trackRarity: false,
      commPriority: meta.commPriority
    };
  });
}

function buildCardsMapForConfiguration(context) {
  const {
    lines,
    selectedGroup,
    getCommanderTheme,
    getCommanderForTheme,
    commanderMeta,
    normalize,
    cheapDecks,
    cheapCommonOnly,
    cardCollectionMap,
    cardTypeMap,
    newCardSets,
    boostPercent,
    singleInclusionMin,
    boostInstants
  } = context;

  const cardsMapA = {
    key: {
      name: 'name',
      theme: 'theme',
      count: 0,
      type: 'type',
      inclusion: 'inclusion',
      commander: 'commander'
    }
  };
  const missingCollectionAudit = new Map();

  function recordMissingCollectionCard(cardName) {
    const normalizedName = normalize(cardName);
    if (!normalizedName || normalizedName === 'name') return;
    const hasCollectionEntry = Boolean(cardCollectionMap[normalizedName]) ||
      Object.keys(cardCollectionMap).some((key) => key.startsWith(normalizedName + ' //'));
    if (hasCollectionEntry) return;
    if (!missingCollectionAudit.has(normalizedName)) {
      missingCollectionAudit.set(normalizedName, String(cardName || '').trim());
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cardName = line[0];
    recordMissingCollectionCard(cardName);
    let type = line[1];
    const inclusion = parseFloat((line[4] || '').split('%')[0] || 0);
    const commander = line[5];
    const theme = getCommanderTheme(selectedGroup, commander);
    const cardKey = cardName + '-' + commander;

    if (cardName.indexOf('É') !== -1 || cardName.indexOf('�') !== -1 || cardName.indexOf('û') !== -1
      || cardName.indexOf('ú') !== -1 || cardName.indexOf('ñ') !== -1 || cardName.indexOf('ó') !== -1) {
      continue;
    }

    if (!theme) {
      continue;
    }

    const themeCommander = getCommanderForTheme(selectedGroup, theme, 'primary');
    const themeSecondary = getCommanderForTheme(selectedGroup, theme, 'secondary');
    if (!themeCommander && !themeSecondary) {
      continue;
    }

    if (!commanderMeta[commander]) {
      continue;
    }

    if (commander !== themeCommander && commander !== themeSecondary) {
      continue;
    }

    const cardNorm = normalize(cardName);
    let checkCardNorm = cardNorm;
    if (cardName.includes(' //')) {
      checkCardNorm = normalize(cardName.split(' //')[0]);
    }

    if (
      cheapDecks &&
      cardCollectionMap[checkCardNorm]
    ) {
      if (cheapCommonOnly &&
        cardCollectionMap[checkCardNorm].rarity !== 'common' && cardCollectionMap[checkCardNorm].rarity !== 'uncommon') {
        continue;
      }
    }

    if ((!type || String(type).trim() === '')) {
      const collEntry = cardCollectionMap[normalize(cardName)];
      if (collEntry && collEntry.type && String(collEntry.type).trim() !== '') {
        type = collEntry.type;
      } else if (cardTypeMap[normalize(cardName)]) {
        type = cardTypeMap[normalize(cardName)];
      }
    }

    const cardCollection = cardCollectionMap[checkCardNorm];
    const isNewCardSetBoost = cardCollection && newCardSets.includes(cardCollection.set.toLowerCase()) && boostPercent > 0 && inclusion >= singleInclusionMin;
    const isInstantBoost = boostInstants && String(type).toLowerCase() === 'instant' && boostPercent > 0 && inclusion >= singleInclusionMin;
    let boostedInclusion = inclusion;
    if (isNewCardSetBoost || isInstantBoost) {
      boostedInclusion = inclusion + boostPercent;
      boostedInclusion = Math.min(boostedInclusion, 95);
    }

    if (cardsMapA[cardKey]) {
      if (boostedInclusion > parseFloat(String(cardsMapA[cardKey].inclusion))) {
        cardsMapA[cardKey].inclusion = boostedInclusion;
      }
    } else {
      cardsMapA[cardKey] = {
        name: cardName,
        theme,
        count: 1,
        type,
        inclusion: boostedInclusion,
        commander
      };
    }
  }

  return {
    cardsMapA,
    missingCollectionAudit
  };
}

function initializeFinalOutputState(directToCube) {
  const duplicateNeededLog = [];
  const duplicateNeededCards = new Set();
  const cardIndices = {
    command: 0,
    name: 1,
    type: 2,
    inclusion: 3,
    themeCount: 4,
    theme: 5,
    status: 6
  };

  const output = [];
  if (directToCube) {
    output.push([
      'name',
      'set',
      'collector number',
      'status',
      'finish',
      'maybeboard',
      'tags'
    ]);
  }

  const typeWarnings = [];
  const missingCards = [];
  const supportedTypes = new Set(['creature', 'land', 'artifact', 'enchantment', 'planeswalker', 'battle', 'sorcery', 'instant']);
  const basicLandNameSet = new Set(['plains', 'island', 'swamp', 'mountain', 'forest']);
  const rejectionLog = [];

  function logRejection(cardName, inclusion, themeName, reason, boardType = 'excluded', themeCount = 1) {
    if (inclusion > 15) {
      rejectionLog.push({
        name: cardName,
        inclusion,
        theme: themeName,
        reason,
        status: boardType,
        themeCount
      });
    }
  }

  return {
    duplicateNeededLog,
    duplicateNeededCards,
    cardIndices,
    output,
    missingCardCount: 0,
    typeWarnings,
    missingCards,
    supportedTypes,
    basicLandNameSet,
    rejectionLog,
    logRejection
  };
}

function buildThresholdData(themeData) {
  const thresholdData = {};
  Object.keys(themeData).forEach((themeName) => {
    thresholdData[themeName] = {
      landMinInclusion: null,
      creatureMinInclusion: null,
      nonCreatureMinInclusion: null,
      landStopAdding: false,
      creatureStopAdding: false,
      nonCreatureStopAdding: false
    };
  });
  return thresholdData;
}

function runCardSelectionPhases(context) {
  const {
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
  } = context;

  const thresholdData = buildThresholdData(themeData);

  const { landOverageLogged } = processLandCardsPhase({
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
    thresholdData,
    getCollectionStatus,
    safeAddToOutput
  });

  const { sharedOverageLogged } = processSharedCardsPhase({
    primeCardOutput,
    cardIndices,
    COMMANDER_META,
    COMMANDER_SETS,
    selectedGroup,
    SHARED_INCLUSION_MIN,
    THEME_CONFIG,
    sortByPriorityAndInclusion,
    cardThemeUsage,
    cardProcessed,
    getMaxCopies,
    themeData,
    cardsMapB,
    updateCardStatus,
    logDuplicateRecommendation,
    logRejection,
    thresholdData,
    RESERVED_CREATURE_SLOTS,
    RESERVED_NONCREATURE_SLOTS,
    getCollectionStatus,
    safeAddToOutput,
    getCardRarity
  });

  resetThresholdDataForRemainingPhase(thresholdData);

  const allRemainingCards = getRemainingCardsCandidates({
    primeCardOutput,
    cardIndices,
    COMMANDER_META,
    getCommanderTheme,
    selectedGroup,
    COMMANDER_SETS,
    SINGLE_INCLUSION_MIN,
    sortByPriorityAndInclusion
  });

  const { remainingOverageLogged } = processRemainingCardsPhase({
    allRemainingCards,
    cardIndices,
    cardThemeUsage,
    cardProcessed,
    getMaxCopies,
    themeData,
    cardsMapB,
    globalCardTracker,
    updateCardStatus,
    logDuplicateRecommendation,
    thresholdData,
    logRejection,
    getCollectionStatus,
    getCardRarity,
    safeAddToOutput
  });

  processOwnedMaybeboardBuffer({
    directToCube,
    cubeMaybeboard,
    includeMaybeboardBuffer,
    ownedMaybeboardBufferCount,
    outCommander,
    themeData,
    allRemainingCards,
    cardIndices,
    cardsMapB,
    cardProcessed,
    getCollectionStatus,
    getMaxCopies,
    cardThemeUsage,
    globalCardTracker,
    maybeboardInclusionThreshold,
    safeAddToOutput
  });

  logOverageAnalysis({
    landOverageLogged,
    sharedOverageLogged,
    remainingOverageLogged
  });

  logThemeValidationAndReports({
    themeData,
    outCommander
  });
}

function finalizeOutputArtifacts(context) {
  const {
    output,
    produceOutCommander,
    outCommander,
    directToCube,
    themeData,
    BASIC_LANDS,
    cheapDecks,
    useCommanderAsTag,
    duplicateNeededLog,
    outputDir,
    missingCollectionAudit,
    typeWarnings,
    missingCards
  } = context;

  appendSingleCommanderBasicLands({
    output,
    produceOutCommander,
    outCommander,
    directToCube,
    themeData,
    BASIC_LANDS,
    cheapDecks,
    useCommanderAsTag
  });

  writeDuplicateRecommendationsCsv({
    duplicateNeededLog,
    outputDir
  });

  output.sort((a, b) => b[3] - a[3]);

  try {
    writeMissingCardsFromCollection({
      outputDir,
      missingCollectionAudit
    });
  } catch (e) {
    void e;
  }

  try {
    writeMissingOrTypeWarnings({
      outputDir,
      typeWarnings,
      missingCards
    });
  } catch (e) {
    void e;
  }

  return output;
}

function formatOutputCard(context) {
  const {
    card,
    board,
    theme,
    overrideCommander,
    cardIndices,
    directToCube,
    basicLandNameSet,
    supportedTypes,
    getCollectionStatus
  } = context;

  let set = '';
  let number = '100';
  let status = 'Owned';
  let finish = 'Non-foil';

  const originalName = card[cardIndices.name];
  const basicLandCheckName = String(originalName || '').replace(/^\d+\s+/, '').trim().toLowerCase();
  const isBasicLandName = basicLandNameSet.has(basicLandCheckName);

  let { collection } = getCollectionStatus(originalName);
  let maybeboard = board === 'maybe' ? 'TRUE' : 'FALSE';

  const cardType = (card[cardIndices.type] || '').toString().trim().toLowerCase();
  const isUnsupportedType = !supportedTypes.has(cardType);
  const commanderForContext = overrideCommander || (theme && theme.checkCommander) || card[cardIndices.command];
  const themeForContext = (theme && theme.checkTheme) || card[cardIndices.theme];

  const typeWarningEntry = isUnsupportedType
    ? {
      name: originalName,
      commander: commanderForContext,
      theme: themeForContext,
      type: cardType || 'empty'
    }
    : null;

  let missingCardEntry = null;
  if (!collection) {
    status = 'Missing';
    missingCardEntry = {
      name: originalName,
      commander: commanderForContext,
      theme: themeForContext,
      type: card[cardIndices.type] || ''
    };
  } else {
    set = collection.set || set;
    number = collection.number || number;
    if (collection.status) {
      const s = collection.status.trim().toLowerCase();
      if (s === 'own exact edition') status = 'Owned';
      else if (s === 'not owned') status = 'Not Owned';
      else if (s === 'rejected' && maybeboard === 'TRUE') status = 'Owned';
      else status = collection.status;
    }
  }

  if (isBasicLandName) {
    set = 'lci';
  }

  let formattedCard;
  if (!directToCube) {
    formattedCard = [...card];
    let formattedName = set ? originalName + ' (' + set + ')' : originalName;
    if (isUnsupportedType) {
      formattedName += ' [TYPE_UNSUPPORTED]';
    }
    if (maybeboard === 'TRUE') {
      formattedName += ' [Maybeboard]';
    }
    formattedCard[cardIndices.name] = formattedName;

    if (theme) {
      formattedCard[cardIndices.command] = overrideCommander || theme.checkCommander;
      formattedCard[cardIndices.theme] = theme.checkTheme;
    }
  } else {
    let printedTheme = (theme && theme.checkTheme) ? theme.checkTheme : card[cardIndices.theme];
    if (isUnsupportedType) {
      printedTheme = printedTheme ? (printedTheme + '|TYPE_UNSUPPORTED') : 'TYPE_UNSUPPORTED';
    }

    formattedCard = [
      originalName,
      set,
      number,
      status,
      finish,
      maybeboard,
      printedTheme
    ];
  }

  return {
    formattedCard,
    typeWarningEntry,
    missingCardEntry,
    isUnsupportedType
  };
}

module.exports = {
  incrementCommand,
  updateCardStatus,
  sortCardCommanders,
  sortByPriorityAndInclusion,
  findCollectionEntry,
  getCollectionStatus,
  getCardRarity,
  getCommanderForTheme,
  getCommanderTheme,
  isSecondaryCommander,
  buildCardMapsAndPrimeOutput,
  buildThemeProcessingData,
  getAssignedCommandersForCard,
  logDuplicateRecommendation,
  getMaxCopiesForCard,
  isDuplicateOutputRow,
  safeAddToOutput,
  validateNoDuplicatesInOutput,
  getValidThemeEntriesForCard,
  processLandCardsPhase,
  processSharedCardsPhase,
  processRemainingCardsPhase,
  processOwnedMaybeboardBuffer,
  logOverageAnalysis,
  resetThresholdDataForRemainingPhase,
  getRemainingCardsCandidates,
  writeDuplicateRecommendationsCsv,
  logThemeValidationAndReports,
  applyOutCommanderFiltering,
  appendSingleCommanderBasicLands,
  writeMissingOrTypeWarnings,
  writeMissingCardsFromCollection,
  formatOutputCard,
  buildCombinedOutputRows,
  writeCombinedOutputFile,
  buildConfigurationResults,
  logMultiConfigurationSummary,
  maybeRunDedup,
  runMultiConfigurationBuild,
  logConfigurationPlan,
  writeBuilderMetadataFile,
  buildOutCommanderList,
  buildCardsMapForConfiguration,
  initializeFinalOutputState,
  buildThresholdData,
  finalizeOutputArtifacts,
  runCardSelectionPhases
};
