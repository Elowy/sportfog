// Előfizetési árak futamidőnként (egy csomag).
const express = require('express');
const router = express.Router();
const prisma = require('../../db');
const { DURATION_ORDER, DURATIONS } = require('../../lib/domain');

router.get('/', async (req, res, next) => {
  try {
    const plans = await prisma.plan.findMany();
    const byDuration = {};
    for (const p of plans) byDuration[p.durationCode] = p;

    const rows = DURATION_ORDER
      .filter((code) => byDuration[code])
      .map((code) => ({ plan: byDuration[code], duration: DURATIONS[code] }));

    res.render('admin/plans/index', {
      title: 'Admin – Árak',
      layout: 'admin/layout',
      rows,
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
    req.flash('success', 'Ár frissítve.');
    res.redirect('/admin/csomagok');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
