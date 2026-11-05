'use strict';

const TOTAL_DECK_COUNT = 100;
const TOTAL_LAND_COUNT = 38;
const BASIC_LAND_MINIMUM = 6;
const SMALL_MULT = 0.6;
const LARGE_MULT = 1.15;
const MAX_MULT = 1.2;
const NO_MULT = 1;
const LAND_INCLUSION_LIMIT = 15;
const SHARED_INCLUSION_MIN = 20;
const SINGLE_INCLUSION_MIN = 7.5;
const DUPLICATE_RECOMMENDATION_MIN_INCLUSION = 30;
const RESERVED_CREATURE_SLOTS = 3;
const RESERVED_NONCREATURE_SLOTS = 3;
const BASIC_LANDS = [
  { color: 'W', name: 'Plains' },
  { color: 'U', name: 'Island' },
  { color: 'B', name: 'Swamp' },
  { color: 'R', name: 'Mountain' },
  { color: 'G', name: 'Forest' }
];

const NEW_CARD_SETS = ['sos', 'ecl', 'fra'];
const BOOST_PERCENT = 10;

const COMMANDER_META = {
  Teval: { theme: 'Reanimate', color: 'BGU', creature: 32, commPriority: 1, deckMultiplier: NO_MULT },
  Meren: { theme: 'Reanimate', color: 'BG', creature: 37, commPriority: 1, deckMultiplier: NO_MULT },
  Sidisi: { theme: 'Reanimate', color: 'BGU', creature: 40, commPriority: 1, deckMultiplier: NO_MULT },

  Zurgo: { theme: 'Aggro', color: 'RWB', creature: 31, commPriority: 1, deckMultiplier: NO_MULT },
  Teysa: { theme: 'Aggro', color: 'WB', creature: 34, commPriority: 1, deckMultiplier: NO_MULT },
  Isshin: { theme: 'Aggro', color: 'RWB', creature: 30, commPriority: 1, deckMultiplier: NO_MULT },

  Shiko: { theme: 'Flurry', color: 'URW', creature: 19, commPriority: 1, deckMultiplier: NO_MULT },
  Stella: { theme: 'Flurry', color: 'UR', creature: 15, commPriority: 1, deckMultiplier: NO_MULT },
  Kykar: { theme: 'Flurry', color: 'URW', creature: 15, commPriority: 1, deckMultiplier: NO_MULT },
  Vraska: { theme: 'Flurry', color: 'URW', creature: 19, commPriority: 1, deckMultiplier: NO_MULT },

  Betor: { theme: 'Counters', color: 'WBG', creature: 34, commPriority: 1, deckMultiplier: NO_MULT },
  Felothar: { theme: 'Counters', color: 'WBG', creature: 35, commPriority: 1, deckMultiplier: NO_MULT },

  Ureni: { theme: 'Dragons', color: 'GUR', creature: 32, commPriority: 1, deckMultiplier: NO_MULT },
  Miirym: { theme: 'Dragons', color: 'GUR', creature: 30, commPriority: 1, deckMultiplier: NO_MULT },

  Eshki: { theme: 'Power', color: 'GUR', creature: 30, commPriority: 1, deckMultiplier: NO_MULT },
  EshkiT: { theme: 'Power', color: 'GUR', creature: 37, commPriority: 1, deckMultiplier: NO_MULT },

  Prosper: { theme: 'Exile', color: 'BR', creature: 25, commPriority: 1, deckMultiplier: NO_MULT },
  Zuko: { theme: 'Exile', color: 'RWB', creature: 27, commPriority: 1, deckMultiplier: NO_MULT },
  Korvold: { theme: 'Exile', color: 'BRG', creature: 30, commPriority: 1, deckMultiplier: NO_MULT },

  Alela: { theme: 'Faeries', color: 'WUB', creature: 20, commPriority: 1, deckMultiplier: NO_MULT },
  AlelaC: { theme: 'Faeries', color: 'UB', creature: 25, commPriority: 1, deckMultiplier: NO_MULT },

  Baylen: { theme: 'Tokens', color: 'RGW', creature: 30, commPriority: 1, deckMultiplier: NO_MULT },
  Brigid: { theme: 'Tokens', color: 'GW', creature: 32, commPriority: 1, deckMultiplier: NO_MULT },

  TophH: { theme: 'Lands', color: 'RG', creature: 25, commPriority: 1, deckMultiplier: NO_MULT },
  TophF: { theme: 'Lands', color: 'RGW', creature: 25, commPriority: 1, deckMultiplier: NO_MULT },
  Omnath: { theme: 'Lands', color: 'RG', creature: 24, commPriority: 1, deckMultiplier: NO_MULT },
  Hearthhull: { theme: 'Lands', color: 'BRG', creature: 31, commPriority: 1, deckMultiplier: NO_MULT },

  Nahiri: { theme: 'Equipment', color: 'RW', creature: 20, commPriority: 1, deckMultiplier: NO_MULT },
  SyrGwyn: { theme: 'Equipment', color: 'RWB', creature: 24, commPriority: 3, deckMultiplier: NO_MULT },

  Satoru: { theme: 'Ninjutsu', color: 'UB', creature: 36, commPriority: 1, deckMultiplier: NO_MULT },
  Ranar: { theme: 'Blink', color: 'WU', creature: 29, commPriority: 1, deckMultiplier: NO_MULT },
  Lathril: { theme: 'Elves', color: 'BG', creature: 36, commPriority: 1, deckMultiplier: NO_MULT },
  Hakbal: { theme: 'Merfolk', color: 'GU', creature: 35, commPriority: 1, deckMultiplier: NO_MULT },
  Kyler: { theme: 'Humans', color: 'GW', creature: 35, commPriority: 1, deckMultiplier: NO_MULT },
  Bello: { theme: 'Enchantments', color: 'RG', creature: 18, commPriority: 1, deckMultiplier: NO_MULT },
  Burakos: { theme: 'Party', color: 'WB', creature: 37, commPriority: 1, deckMultiplier: NO_MULT }
};

const THEME_CONFIG = {
  Reanimate: { sharedInclusionMin: 20, totalLandCount: 38, primarySharedOnly: false },
  Aggro: { sharedInclusionMin: 25, totalLandCount: 37, primarySharedOnly: false },
  Flurry: { sharedInclusionMin: 20, totalLandCount: 36, primarySharedOnly: false },
  Dragons: { sharedInclusionMin: 20, totalLandCount: 38, primarySharedOnly: false },
  Faeries: { sharedInclusionMin: 33, totalLandCount: 36, primarySharedOnly: true },
  Counters: { sharedInclusionMin: 33, totalLandCount: 37, primarySharedOnly: true },
  Tokens: { sharedInclusionMin: 33, totalLandCount: 36, primarySharedOnly: true },
  Exile: { sharedInclusionMin: 33, totalLandCount: 37, primarySharedOnly: true },
  Power: { sharedInclusionMin: 33, totalLandCount: 36, primarySharedOnly: true },
  Ninjutsu: { sharedInclusionMin: 20, totalLandCount: 36, primarySharedOnly: false },
  Lands: { sharedInclusionMin: 20, totalLandCount: 38, primarySharedOnly: false },
  Equipment: { sharedInclusionMin: 20, totalLandCount: 37, primarySharedOnly: false },
  Blink: { sharedInclusionMin: 20, totalLandCount: 37, primarySharedOnly: false },
  Elves: { sharedInclusionMin: 20, totalLandCount: 36, primarySharedOnly: false },
  Merfolk: { sharedInclusionMin: 20, totalLandCount: 37, primarySharedOnly: false },
  Humans: { sharedInclusionMin: 20, totalLandCount: 37, primarySharedOnly: false },
  Enchantments: { sharedInclusionMin: 20, totalLandCount: 38, primarySharedOnly: false },
  Party: { sharedInclusionMin: 20, totalLandCount: 37, primarySharedOnly: false }
};

const BUILDER_DEFAULT_COMMANDER_SETS = {
  new_primary_4: {
    Flurry: { primary: 'Stella' },
    Counters: { primary: 'Betor' },
    Merfolk: { primary: 'Hakbal' },
    Exile: { primary: 'Zuko' }
  },
  new_primary_5: {
    Flurry: { primary: 'Stella' },
    Counters: { primary: 'Betor' },
    Merfolk: { primary: 'Hakbal' },
    Exile: { primary: 'Zuko' },
    Enchantments: { primary: 'Bello' }
  },
  new_primary_wedges: {
    Flurry: { primary: 'Kykar' },
    Counters: { primary: 'Betor' },
    Reanimate: { primary: 'Teval' },
    Aggro: { primary: 'Isshin' },
    Dragons: { primary: 'Ureni' }
  },
  primary_4: {
    Reanimate: { primary: 'Teval', secondary: 'Sidisi' },
    Aggro: { primary: 'Isshin', secondary: 'Zurgo' },
    Flurry: { primary: 'Kykar', secondary: 'Stella' },
    Counters: { primary: 'Betor', secondary: 'Felothar' }
  },
  primary_5: {
    Reanimate: { primary: 'Teval', secondary: 'Sidisi' },
    Aggro: { primary: 'Isshin', secondary: 'Zurgo' },
    Flurry: { primary: 'Kykar', secondary: 'Stella' },
    Dragons: { primary: 'Ureni', secondary: 'Miirym' },
    Counters: { primary: 'Betor', secondary: 'Felothar' }
  },
  secondary: {
    Faeries: { primary: 'AlelaC', secondary: 'Alela' },
    Elves: { primary: 'Lathril' },
    Merfolk: { primary: 'Hakbal' },
    Exile: { primary: 'Zuko', secondary: 'Prosper' },
    Lands: { primary: 'TophF', secondary: 'TophH' }
  },
  secondary2: {
    Faeries: { primary: 'AlelaC', secondary: 'Alela' },
    Elves: { primary: 'Lathril' },
    Merfolk: { primary: 'Hakbal' },
    Exile: { primary: 'Prosper', secondary: 'Zuko' },
    Enchantments: { primary: 'Bello' },
    Party: { primary: 'Burakos' }
  }
};

const BUILDER_DEFAULT_OUT_COMMANDER_LIST = {
  single: ['Betor'],
  new_primary_4: ['Stella', 'Betor', 'Hakbal', 'Zuko'],
  new_primary_5: ['Bello'],
  new_primary_wedges: ['Teval', 'Isshin', 'Ureni'],
  primary_4: ['Teval', 'Isshin', 'Kykar', 'Betor'],
  primary_5: ['Ureni'],
  secondary_tribal: ['AlelaC', 'Lathril', 'Hakbal'],
  secondary_ub: ['Zuko', 'TophF'],
  secondary2: ['Bello', 'Burakos']
};

const BUILDER_DEFAULT_CONFIGURATION_SETS = [
  { selectedGroup: 'new_primary_4', selectedCommander: 'new_primary_4' },
  { selectedGroup: 'new_primary_5', selectedCommander: 'new_primary_5' },
  { selectedGroup: 'new_primary_wedges', selectedCommander: 'new_primary_wedges' }
];

module.exports = {
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
};
