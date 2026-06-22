// Admin gyökér: jogosultság-ellenőrzés + irányítópult + al-útvonalak.
const express = require('express');
const router = express.Router();
const prisma = require('../../db');
const { requireAdmin } = require('../../middleware/auth');

router.use(requireAdmin);

router.get('/', async (req, res, next) => {
  try {
    const now = new Date();
    const [userCount, matchCount, upcomingCount, tipCount, pendingTips, paidGrants, invoiceErrors] =
      await Promise.all([
        prisma.user.count(),
        prisma.match.count(),
        prisma.match.count({ where: { status: 'SCHEDULED', kickoffAt: { gte: now } } }),
        prisma.tip.count(),
        prisma.tip.count({ where: { result: 'PENDING' } }),
        prisma.accessGrant.count({ where: { status: 'PAID' } }),
        prisma.accessGrant.count({ where: { invoiceError: { not: null }, status: 'PAID' } }),
      ]);

    const recentGrants = await prisma.accessGrant.findMany({
      where: { status: 'PAID' },
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: { user: true },
    });

    res.render('admin/dashboard', {
      title: 'Admin – Irányítópult',
      layout: 'admin/layout',
      stats: { userCount, matchCount, upcomingCount, tipCount, pendingTips, paidGrants, invoiceErrors },
      recentGrants,
    });
  } catch (err) {
    next(err);
  }
});

router.use('/meccsek', require('./matches'));
router.use('/tippek', require('./tips'));
router.use('/csomagok', require('./plans'));
router.use('/felhasznalok', require('./users'));
router.use('/uzenetek', require('./messages'));

module.exports = router;
