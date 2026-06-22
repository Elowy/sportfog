// Tippek szerkesztése, törlése, eredmény beállítása.
const express = require('express');
const router = express.Router();
const prisma = require('../../db');
const { BET_TYPES, BET_TYPE_ORDER, TIER_ORDER, TIERS, TIP_RESULTS, TIP_RESULT_ORDER } = require('../../lib/domain');

// Szerkesztő űrlap
router.get('/:id/szerkeszt', async (req, res, next) => {
  try {
    const tip = await prisma.tip.findUnique({ where: { id: req.params.id }, include: { match: true } });
    if (!tip) {
      return res.status(404).render('error', { title: 'Nincs tipp', message: 'A tipp nem található.' });
    }
    res.render('admin/tips/form', {
      title: 'Admin – Tipp szerkesztése',
      layout: 'admin/layout',
      tip,
      betTypes: BET_TYPES,
      betTypeOrder: BET_TYPE_ORDER,
      tierOrder: TIER_ORDER,
      tiers: TIERS,
      results: TIP_RESULTS,
      resultOrder: TIP_RESULT_ORDER,
    });
  } catch (err) {
    next(err);
  }
});

// Módosítás
router.post('/:id', async (req, res, next) => {
  try {
    const tip = await prisma.tip.findUnique({ where: { id: req.params.id } });
    if (!tip) {
      return res.status(404).render('error', { title: 'Nincs tipp', message: 'A tipp nem található.' });
    }
    const { betType, selection, line, odds, confidence, stake, requiredTier, analysis, result } = req.body;
    await prisma.tip.update({
      where: { id: tip.id },
      data: {
        betType: BET_TYPES[betType] ? betType : tip.betType,
        selection: selection && selection.trim() ? selection.trim() : tip.selection,
        line: line ? parseFloat(line) : null,
        odds: odds ? parseFloat(odds) : null,
        confidence: confidence ? parseInt(confidence, 10) : null,
        stake: stake ? parseInt(stake, 10) : null,
        requiredTier: TIERS[requiredTier] ? requiredTier : tip.requiredTier,
        analysis: analysis ? analysis.trim() : null,
        result: TIP_RESULTS[result] ? result : tip.result,
      },
    });
    req.flash('success', 'Tipp frissítve.');
    res.redirect(`/admin/meccsek/${tip.matchId}`);
  } catch (err) {
    next(err);
  }
});

// Gyors eredmény-beállítás (a meccs nézetből)
router.post('/:id/eredmeny', async (req, res, next) => {
  try {
    const tip = await prisma.tip.findUnique({ where: { id: req.params.id } });
    if (!tip) {
      return res.status(404).render('error', { title: 'Nincs tipp', message: 'A tipp nem található.' });
    }
    const result = TIP_RESULTS[req.body.result] ? req.body.result : tip.result;
    await prisma.tip.update({ where: { id: tip.id }, data: { result } });
    req.flash('success', 'Eredmény frissítve.');
    res.redirect(`/admin/meccsek/${tip.matchId}`);
  } catch (err) {
    next(err);
  }
});

// Törlés
router.post('/:id/torles', async (req, res, next) => {
  try {
    const tip = await prisma.tip.findUnique({ where: { id: req.params.id } });
    if (!tip) {
      return res.status(404).render('error', { title: 'Nincs tipp', message: 'A tipp nem található.' });
    }
    await prisma.tip.delete({ where: { id: tip.id } });
    req.flash('success', 'Tipp törölve.');
    res.redirect(`/admin/meccsek/${tip.matchId}`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
