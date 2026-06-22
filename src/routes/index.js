// Nyilvános kezdőoldal.
const express = require('express');
const router = express.Router();
const prisma = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const now = new Date();
    const upcoming = await prisma.match.findMany({
      where: { kickoffAt: { gte: now }, status: 'SCHEDULED', tips: { some: {} } },
      orderBy: { kickoffAt: 'asc' },
      take: 6,
      include: { tips: true },
    });

    const [won, lost, total] = await Promise.all([
      prisma.tip.count({ where: { result: 'WON' } }),
      prisma.tip.count({ where: { result: 'LOST' } }),
      prisma.tip.count({ where: { result: { in: ['WON', 'LOST'] } } }),
    ]);
    const winRate = total > 0 ? Math.round((won / total) * 100) : null;

    res.render('home', {
      title: 'Sportfogadási tippek profiktól',
      upcoming,
      stats: { won, lost, total, winRate },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
