// Előfizetési csomagok, Stripe Checkout indítása, siker/megszakítás oldalak.
const express = require('express');
const router = express.Router();
const prisma = require('../db');
const stripeLib = require('../lib/stripe');
const { requireAuth } = require('../middleware/auth');
const { fulfillFromSession } = require('../services/fulfillment');
const { TIER_ORDER, DURATION_ORDER, TIERS, DURATIONS } = require('../lib/domain');

// Csomagok listája (szint × időtartam mátrix).
router.get('/', async (req, res, next) => {
  try {
    const plans = await prisma.plan.findMany({ where: { active: true } });

    // Mátrix: tier -> durationCode -> plan
    const matrix = {};
    for (const tier of TIER_ORDER) matrix[tier] = {};
    for (const p of plans) {
      if (!matrix[p.tier]) matrix[p.tier] = {};
      matrix[p.tier][p.durationCode] = p;
    }

    res.render('subscribe/index', {
      title: 'Előfizetés',
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

// Checkout indítása egy kiválasztott csomagra.
router.post('/checkout', requireAuth, async (req, res, next) => {
  try {
    if (!stripeLib.isEnabled()) {
      req.flash('error', 'A fizetés jelenleg nem elérhető (a Stripe nincs beállítva).');
      return res.redirect('/elofizetes');
    }

    const plan = await prisma.plan.findUnique({ where: { id: req.body.planId } });
    if (!plan || !plan.active) {
      req.flash('error', 'A kiválasztott csomag nem elérhető.');
      return res.redirect('/elofizetes');
    }

    // Függőben lévő hozzáférés létrehozása (a fizetés után aktiváljuk).
    const grant = await prisma.accessGrant.create({
      data: {
        userId: req.user.id,
        planId: plan.id,
        tier: plan.tier,
        durationDays: plan.durationDays,
        amountHuf: plan.priceHuf,
        status: 'PENDING',
        source: 'STRIPE',
        // Ideiglenes lejárat; a tényleges értéket fizetéskor állítjuk be.
        expiresAt: new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000),
      },
    });

    const customerId = await stripeLib.ensureCustomer(prisma, req.user);
    const session = await stripeLib.createCheckoutSession({
      user: req.user,
      plan,
      grant,
      customerId,
    });

    await prisma.accessGrant.update({
      where: { id: grant.id },
      data: { stripeSessionId: session.id },
    });

    res.redirect(303, session.url);
  } catch (err) {
    next(err);
  }
});

// Sikeres fizetés visszairányítás. A webhook a megbízható forrás, de itt is
// megpróbáljuk azonnal aktiválni (fallback), hogy a felhasználó rögtön lássa.
router.get('/siker', requireAuth, async (req, res, next) => {
  try {
    const sessionId = req.query.session_id;
    let grant = null;
    if (sessionId && stripeLib.isEnabled()) {
      try {
        const session = await stripeLib.retrieveSession(sessionId);
        const result = await fulfillFromSession(session);
        if (result.ok) grant = result.grant;
      } catch (err) {
        console.warn('Siker oldal aktiválási hiba:', err.message);
      }
    }
    res.render('subscribe/success', { title: 'Sikeres fizetés', grant });
  } catch (err) {
    next(err);
  }
});

router.get('/megse', (req, res) => {
  res.render('subscribe/cancel', { title: 'Fizetés megszakítva' });
});

module.exports = router;
