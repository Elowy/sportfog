// Nyilvános kezdőoldal.
const express = require('express');
const router = express.Router();
const prisma = require('../db');
const { unsubToken } = require('../services/notifications');

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

// E-mail leiratkozás (az e-mailben lévő link tokenjével, bejelentkezés nélkül).
router.get('/leiratkozas', async (req, res, next) => {
  try {
    const { u, t } = req.query;
    if (!u || !t || t !== unsubToken(u)) {
      return res.status(400).render('info', { title: 'Érvénytelen link', message: 'A leiratkozó link érvénytelen vagy lejárt.', icon: '⚠️' });
    }
    await prisma.user.update({ where: { id: u }, data: { notifyEmail: false } }).catch(() => {});
    res.render('info', { title: 'Leiratkoztál', message: 'Többé nem küldünk e-mail értesítőt az új tippekről. Bármikor visszakapcsolhatod a Fiókom oldalon.', icon: '✅' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
