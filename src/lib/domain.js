// Központi domain-konstansok: előfizetési szintek, időtartamok, fogadási típusok.
// Magyar nyelvű címkékkel, hogy a nézetek és az admin egységesen használhassák.

// --- Előfizetési futamidők (egy csomag, változtatható időtartammal) --------
const DURATIONS = {
  DAY_1: { code: 'DAY_1', label: '1 nap', days: 1 },
  WEEK_1: { code: 'WEEK_1', label: '1 hét', days: 7 },
  MONTH_1: { code: 'MONTH_1', label: '1 hónap', days: 30 },
  MONTH_3: { code: 'MONTH_3', label: '3 hónap', days: 90 },
  MONTH_6: { code: 'MONTH_6', label: '6 hónap', days: 180 },
  YEAR_1: { code: 'YEAR_1', label: '1 év', days: 365 },
};

const DURATION_ORDER = ['DAY_1', 'WEEK_1', 'MONTH_1', 'MONTH_3', 'MONTH_6', 'YEAR_1'];

// --- Böngészési időablakok (a tippek listájához) --------------------------
// Ugyanazok az intervallumok, mint az előfizetésnél, de itt szűrőként
// a közelgő meccsek szűrésére szolgálnak.
const TIME_WINDOWS = {
  '1d': { code: '1d', label: '1 nap', days: 1 },
  '3d': { code: '3d', label: '3 nap', days: 3 },
  '1w': { code: '1w', label: '1 hét', days: 7 },
  '1m': { code: '1m', label: '1 hónap', days: 30 },
  '3m': { code: '3m', label: '3 hónap', days: 90 },
  '6m': { code: '6m', label: '6 hónap', days: 180 },
  '1y': { code: '1y', label: '1 év', days: 365 },
};

const TIME_WINDOW_ORDER = ['1d', '3d', '1w', '1m', '3m', '6m', '1y'];

// --- Fogadási típusok -----------------------------------------------------
// Minden típushoz tartoznak gyakori "selection" javaslatok az admin űrlapon.
const BET_TYPES = {
  RESULT_1X2: {
    code: 'RESULT_1X2',
    label: 'Végeredmény (1X2)',
    short: '1X2',
    selections: ['Hazai (1)', 'Döntetlen (X)', 'Vendég (2)'],
    hasLine: false,
  },
  DOUBLE_CHANCE: {
    code: 'DOUBLE_CHANCE',
    label: 'Kettős esély',
    short: 'Kettős esély',
    selections: ['Hazai vagy döntetlen (1X)', 'Hazai vagy vendég (12)', 'Döntetlen vagy vendég (X2)'],
    hasLine: false,
  },
  OVER_UNDER_GOALS: {
    code: 'OVER_UNDER_GOALS',
    label: 'Gólok száma (Over/Under)',
    short: 'Gólok O/U',
    selections: ['Over', 'Under'],
    hasLine: true,
  },
  BTTS: {
    code: 'BTTS',
    label: 'Mindkét csapat gólt szerez',
    short: 'BTTS',
    selections: ['Igen', 'Nem'],
    hasLine: false,
  },
  CORNERS: {
    code: 'CORNERS',
    label: 'Szögletek',
    short: 'Szöglet',
    selections: ['Over', 'Under', 'Hazai több szöglet', 'Vendég több szöglet'],
    hasLine: true,
  },
  CARDS: {
    code: 'CARDS',
    label: 'Lapok (sárga/piros)',
    short: 'Lapok',
    selections: ['Over', 'Under', 'Lesz piros lap', 'Nem lesz piros lap'],
    hasLine: true,
  },
  HALFTIME_RESULT: {
    code: 'HALFTIME_RESULT',
    label: 'Félidei eredmény',
    short: 'Félidő',
    selections: ['Hazai (1)', 'Döntetlen (X)', 'Vendég (2)'],
    hasLine: false,
  },
  HANDICAP: {
    code: 'HANDICAP',
    label: 'Hendikep',
    short: 'Hendikep',
    selections: ['Hazai hendikep', 'Vendég hendikep'],
    hasLine: true,
  },
  OTHER: {
    code: 'OTHER',
    label: 'Egyéb',
    short: 'Egyéb',
    selections: [],
    hasLine: true,
  },
};

const BET_TYPE_ORDER = [
  'RESULT_1X2',
  'DOUBLE_CHANCE',
  'OVER_UNDER_GOALS',
  'BTTS',
  'CORNERS',
  'CARDS',
  'HALFTIME_RESULT',
  'HANDICAP',
  'OTHER',
];

function betTypeLabel(code) {
  return BET_TYPES[code] ? BET_TYPES[code].label : code;
}

// --- Tipp eredmény --------------------------------------------------------
const TIP_RESULTS = {
  PENDING: { code: 'PENDING', label: 'Függőben', color: 'slate' },
  WON: { code: 'WON', label: 'Nyert', color: 'green' },
  LOST: { code: 'LOST', label: 'Vesztett', color: 'red' },
  VOID: { code: 'VOID', label: 'Érvénytelen', color: 'slate' },
};

const TIP_RESULT_ORDER = ['PENDING', 'WON', 'LOST', 'VOID'];

function tipResultLabel(code) {
  return TIP_RESULTS[code] ? TIP_RESULTS[code].label : code;
}

const MATCH_STATUSES = {
  SCHEDULED: { code: 'SCHEDULED', label: 'Kiírva' },
  FINISHED: { code: 'FINISHED', label: 'Lejátszott' },
  CANCELLED: { code: 'CANCELLED', label: 'Elmaradt' },
};

// --- Segédfüggvények ------------------------------------------------------
function formatHuf(amount) {
  if (amount === null || amount === undefined) return '';
  return new Intl.NumberFormat('hu-HU').format(amount) + ' Ft';
}

function formatDateTime(date) {
  if (!date) return '';
  return new Intl.DateTimeFormat('hu-HU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

function formatDate(date) {
  if (!date) return '';
  return new Intl.DateTimeFormat('hu-HU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(date));
}

module.exports = {
  DURATIONS,
  DURATION_ORDER,
  TIME_WINDOWS,
  TIME_WINDOW_ORDER,
  BET_TYPES,
  BET_TYPE_ORDER,
  betTypeLabel,
  TIP_RESULTS,
  TIP_RESULT_ORDER,
  tipResultLabel,
  MATCH_STATUSES,
  formatHuf,
  formatDateTime,
  formatDate,
};
