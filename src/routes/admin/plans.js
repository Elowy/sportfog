// Előfizetési csomagok árazása és Stripe Price azonosítók kezelése.
const express = require('express');
const router = express.Router();
const prisma = require('../../db');
const { TIER_ORDER, DURATION_ORDER, TIERS, DURATIONS } = require('../../lib/domain');

router.get('/', async (req, res, next) => {
  try {
    const plans = await prisma.plan.findMany();
    const byId = {};
    const matrix = {};
    for (const tier of TIER_ORDER) matrix[tier] = {};
    for (const p of plans) {
      byId[p.id] = p;
      if (!matrix[p.tier]) matrix[p.tier] = {};
      matrix[p.tier][p.durationCode] = p;
    }
    res.render('admin/plans/index', {
      title: 'Admin – Csomagok',
      layout: 'admin/layout',
      matrix,
      tierOrder: TIER_ORDER,
      durationOrder: DURATION_ORDER,
      tiers: TIERS,
      durations: DURATIONS,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id', async (req, res, next) => {
  try {
    const plan = await prisma.plan.findUnique({ where: { id: req.params.id } });
    if (!plan) {
      return res.status(404).render('error', { title: 'Nincs csomag', message: 'A csomag nem található.' });
    }
    const priceHuf = parseInt(req.body.priceHuf, 10);
    await prisma.plan.update({
      where: { id: plan.id },
      data: {
        priceHuf: Number.isFinite(priceHuf) && priceHuf >= 0 ? priceHuf : plan.priceHuf,
        stripePriceId: req.body.stripePriceId ? req.body.stripePriceId.trim() : null,
        active: req.body.active === 'on' || req.body.active === 'true',
      },
    });
    req.flash('success', 'Csomag frissítve.');
    res.redirect('/admin/csomagok');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
