// Felhasználók kezelése: szerepkör váltása, kézi hozzáférés adása.
const express = require('express');
const router = express.Router();
const prisma = require('../../db');
const { getActiveAccess } = require('../../lib/access');
const { TIER_ORDER, DURATION_ORDER, TIERS, DURATIONS } = require('../../lib/domain');

router.get('/', async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
    const withAccess = await Promise.all(
      users.map(async (u) => ({ user: u, access: await getActiveAccess(prisma, u.id) }))
    );
    res.render('admin/users/index', {
      title: 'Admin – Felhasználók',
      layout: 'admin/layout',
      rows: withAccess,
      tierOrder: TIER_ORDER,
      durationOrder: DURATION_ORDER,
      tiers: TIERS,
      durations: DURATIONS,
    });
  } catch (err) {
    next(err);
  }
});

// Szerepkör váltása (USER <-> ADMIN). Önmagát ne fokozza le.
router.post('/:id/szerep', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) {
      return res.status(404).render('error', { title: 'Nincs felhasználó', message: 'A felhasználó nem található.' });
    }
    if (user.id === req.user.id) {
      req.flash('error', 'A saját szerepkörödet itt nem módosíthatod.');
      return res.redirect('/admin/felhasznalok');
    }
    const role = user.role === 'ADMIN' ? 'USER' : 'ADMIN';
    await prisma.user.update({ where: { id: user.id }, data: { role } });
    req.flash('success', `Szerepkör módosítva: ${role}.`);
    res.redirect('/admin/felhasznalok');
  } catch (err) {
    next(err);
  }
});

// Kézi hozzáférés adása (pl. promó / kompenzáció) – nem készít számlát.
router.post('/:id/hozzaferes', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) {
      return res.status(404).render('error', { title: 'Nincs felhasználó', message: 'A felhasználó nem található.' });
    }
    const tier = TIERS[req.body.tier] ? req.body.tier : 'BASIC';
    const durationCode = DURATIONS[req.body.durationCode] ? req.body.durationCode : 'WEEK_1';
    const days = DURATIONS[durationCode].days;

    await prisma.accessGrant.create({
      data: {
        userId: user.id,
        tier,
        durationDays: days,
        amountHuf: 0,
        status: 'PAID',
        source: 'MANUAL',
        startsAt: new Date(),
        expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      },
    });
    req.flash('success', `Hozzáférés megadva: ${TIERS[tier].label} (${DURATIONS[durationCode].label}).`);
    res.redirect('/admin/felhasznalok');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
