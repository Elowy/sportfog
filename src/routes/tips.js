// Tippek megtekintése. A közelgő tippek előfizetéshez (és szinthez) kötöttek,
// a lejátszott meccsek eredményei (track record) bárki számára láthatók.
const express = require('express');
const router = express.Router();
const prisma = require('../db');
const { TIME_WINDOWS, TIME_WINDOW_ORDER, BET_TYPE_ORDER } = require('../lib/domain');

// Közelgő tippek időablak + fogadási típus szűrővel.
router.get('/', async (req, res, next) => {
  try {
    const windowCode = TIME_WINDOWS[req.query.ido] ? req.query.ido : '1w';
    const win = TIME_WINDOWS[windowCode];
    const betType = BET_TYPE_ORDER.includes(req.query.tipus) ? req.query.tipus : null;

    const now = new Date();
    const until = new Date(now.getTime() + win.days * 24 * 60 * 60 * 1000);

    const matches = await prisma.match.findMany({
      where: {
        status: 'SCHEDULED',
        kickoffAt: { gte: now, lte: until },
        tips: betType ? { some: { betType } } : { some: {} },
      },
      orderBy: { kickoffAt: 'asc' },
      include: {
        tips: {
          where: betType ? { betType } : undefined,
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    res.render('tips/index', {
      title: 'Tippek',
      matches,
      windowCode,
      betType,
      windowOrder: TIME_WINDOW_ORDER,
      betTypeOrder: BET_TYPE_ORDER,
    });
  } catch (err) {
    next(err);
  }
});

// Eredmények / track record – nyilvános.
router.get('/eredmenyek', async (req, res, next) => {
  try {
    const now = new Date();
    const matches = await prisma.match.findMany({
      where: {
        OR: [{ status: 'FINISHED' }, { kickoffAt: { lt: now } }],
        tips: { some: { result: { in: ['WON', 'LOST', 'VOID'] } } },
      },
      orderBy: { kickoffAt: 'desc' },
      take: 60,
      include: { tips: { orderBy: { createdAt: 'asc' } } },
    });

    const [won, lost, voided] = await Promise.all([
      prisma.tip.count({ where: { result: 'WON' } }),
      prisma.tip.count({ where: { result: 'LOST' } }),
      prisma.tip.count({ where: { result: 'VOID' } }),
    ]);
    const decided = won + lost;
    const winRate = decided > 0 ? Math.round((won / decided) * 100) : null;

    res.render('tips/results', {
      title: 'Eredmények',
      matches,
      stats: { won, lost, voided, winRate },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
