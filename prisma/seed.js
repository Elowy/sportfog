// Adatbázis feltöltése kezdeti adatokkal:
//  - admin felhasználó (a .env ADMIN_* értékei alapján)
//  - előfizetési csomagok (szint × időtartam mátrix)
//  - néhány demó meccs és tipp (csak ha még nincs meccs)
require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('../src/db');
const config = require('../src/config');
const { DURATIONS } = require('../src/lib/domain');

// Árazás (bruttó Ft) szintenként és időtartamonként.
const PRICING = {
  BASIC: {
    DAY_1: 990, DAY_3: 1990, WEEK_1: 2990, MONTH_1: 4990, MONTH_3: 12990, MONTH_6: 22990, YEAR_1: 39990,
  },
  PREMIUM: {
    DAY_1: 1990, DAY_3: 3990, WEEK_1: 5990, MONTH_1: 9990, MONTH_3: 24990, MONTH_6: 44990, YEAR_1: 79990,
  },
  VIP: {
    DAY_1: 3990, DAY_3: 7990, WEEK_1: 11990, MONTH_1: 19990, MONTH_3: 49990, MONTH_6: 89990, YEAR_1: 159990,
  },
};

async function seedAdmin() {
  const email = config.admin.email.toLowerCase();
  const passwordHash = await bcrypt.hash(config.admin.password, 10);
  const admin = await prisma.user.upsert({
    where: { email },
    update: { role: 'ADMIN', name: config.admin.name },
    create: { email, name: config.admin.name, role: 'ADMIN', passwordHash },
  });
  console.log(`Admin kész: ${admin.email}`);
}

async function seedPlans() {
  let count = 0;
  for (const tier of Object.keys(PRICING)) {
    for (const durationCode of Object.keys(PRICING[tier])) {
      const priceHuf = PRICING[tier][durationCode];
      const durationDays = DURATIONS[durationCode].days;
      await prisma.plan.upsert({
        where: { tier_durationCode: { tier, durationCode } },
        update: { durationDays, priceHuf, active: true },
        create: { tier, durationCode, durationDays, priceHuf, active: true },
      });
      count++;
    }
  }
  console.log(`Csomagok kész: ${count} db`);
}

function inDays(days, hour = 20, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function seedDemoMatches() {
  const existing = await prisma.match.count();
  if (existing > 0) {
    console.log('Demó meccsek kihagyva (már vannak meccsek).');
    return;
  }

  // Közelgő meccsek tippekkel (különböző szintek és fogadási típusok).
  const upcoming = [
    {
      league: 'OTP Bank Liga',
      homeTeam: 'Ferencváros',
      awayTeam: 'Puskás Akadémia',
      kickoffAt: inDays(1, 18, 0),
      tips: [
        { betType: 'RESULT_1X2', selection: 'Hazai (1)', odds: 1.65, confidence: 4, stake: 5, requiredTier: 'BASIC', analysis: 'A Fradi hazai pályán stabil, a Puskás idegenben gyengébb.' },
        { betType: 'OVER_UNDER_GOALS', selection: 'Over', line: 2.5, odds: 1.8, confidence: 3, stake: 3, requiredTier: 'PREMIUM', analysis: 'Mindkét csapat támadó felfogásban játszik.' },
        { betType: 'CORNERS', selection: 'Over', line: 9.5, odds: 1.9, confidence: 3, stake: 2, requiredTier: 'VIP', analysis: 'A Fradi sok beadással operál, magas szögletszám várható.' },
      ],
    },
    {
      league: 'Premier League',
      homeTeam: 'Arsenal',
      awayTeam: 'Chelsea',
      kickoffAt: inDays(2, 17, 30),
      tips: [
        { betType: 'BTTS', selection: 'Igen', odds: 1.72, confidence: 4, stake: 4, requiredTier: 'BASIC', analysis: 'Londoni rangadó, mindkét csapat szerez gólt jellemzően.' },
        { betType: 'CARDS', selection: 'Over', line: 4.5, odds: 1.95, confidence: 3, stake: 2, requiredTier: 'PREMIUM', analysis: 'Feszült rangadó, sok lap szokott lenni.' },
      ],
    },
    {
      league: 'La Liga',
      homeTeam: 'Real Madrid',
      awayTeam: 'Sevilla',
      kickoffAt: inDays(3, 21, 0),
      tips: [
        { betType: 'RESULT_1X2', selection: 'Hazai (1)', odds: 1.45, confidence: 5, stake: 6, requiredTier: 'BASIC', analysis: 'A Real otthon nagy esélyes.' },
        { betType: 'DOUBLE_CHANCE', selection: 'Hazai vagy döntetlen (1X)', odds: 1.15, confidence: 5, stake: 8, requiredTier: 'VIP', analysis: 'Biztonsági tipp magas téthez.' },
      ],
    },
    {
      league: 'Serie A',
      homeTeam: 'Internazionale',
      awayTeam: 'Napoli',
      kickoffAt: inDays(5, 20, 45),
      tips: [
        { betType: 'OVER_UNDER_GOALS', selection: 'Under', line: 2.5, odds: 1.85, confidence: 3, stake: 3, requiredTier: 'PREMIUM', analysis: 'Két erős védelem, kevés gól várható.' },
      ],
    },
  ];

  for (const m of upcoming) {
    const { tips, ...matchData } = m;
    await prisma.match.create({
      data: { ...matchData, status: 'SCHEDULED', tips: { create: tips } },
    });
  }

  // Lejátszott meccsek eredménnyel (track record).
  const past = [
    {
      league: 'OTP Bank Liga',
      homeTeam: 'Újpest',
      awayTeam: 'Debrecen',
      kickoffAt: inDays(-3, 18, 0),
      status: 'FINISHED',
      tips: [
        { betType: 'RESULT_1X2', selection: 'Hazai (1)', odds: 2.1, confidence: 3, requiredTier: 'BASIC', result: 'WON', analysis: 'Hazai siker.' },
        { betType: 'OVER_UNDER_GOALS', selection: 'Over', line: 2.5, odds: 1.8, confidence: 3, requiredTier: 'PREMIUM', result: 'WON' },
      ],
    },
    {
      league: 'Premier League',
      homeTeam: 'Liverpool',
      awayTeam: 'Manchester City',
      kickoffAt: inDays(-5, 17, 30),
      status: 'FINISHED',
      tips: [
        { betType: 'BTTS', selection: 'Igen', odds: 1.6, confidence: 4, requiredTier: 'BASIC', result: 'WON' },
        { betType: 'RESULT_1X2', selection: 'Vendég (2)', odds: 2.4, confidence: 2, requiredTier: 'VIP', result: 'LOST' },
      ],
    },
    {
      league: 'Bundesliga',
      homeTeam: 'Bayern München',
      awayTeam: 'Dortmund',
      kickoffAt: inDays(-7, 18, 30),
      status: 'FINISHED',
      tips: [
        { betType: 'OVER_UNDER_GOALS', selection: 'Over', line: 3.5, odds: 1.9, confidence: 3, requiredTier: 'PREMIUM', result: 'WON' },
        { betType: 'CORNERS', selection: 'Over', line: 10.5, odds: 1.85, confidence: 2, requiredTier: 'VIP', result: 'LOST' },
      ],
    },
  ];

  for (const m of past) {
    const { tips, ...matchData } = m;
    await prisma.match.create({ data: { ...matchData, tips: { create: tips } } });
  }

  console.log(`Demó meccsek kész: ${upcoming.length} közelgő + ${past.length} lejátszott`);
}

async function main() {
  await seedAdmin();
  await seedPlans();
  await seedDemoMatches();
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log('Seed kész.');
  })
  .catch(async (err) => {
    console.error('Seed hiba:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
