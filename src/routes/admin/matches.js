// Meccsek kezelése (és a meccshez tartozó tippek létrehozása).
const express = require('express');
const router = express.Router();
const prisma = require('../../db');
const { MATCH_STATUSES, BET_TYPES, BET_TYPE_ORDER, TIER_ORDER, TIERS } = require('../../lib/domain');

function parseKickoff(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Lista
router.get('/', async (req, res, next) => {
  try {
    const matches = await prisma.match.findMany({
      orderBy: { kickoffAt: 'desc' },
      include: { _count: { select: { tips: true } } },
    });
    res.render('admin/matches/index', {
      title: 'Admin – Meccsek',
      layout: 'admin/layout',
      matches,
    });
  } catch (err) {
    next(err);
  }
});

// Új meccs űrlap
router.get('/uj', (req, res) => {
  res.render('admin/matches/form', {
    title: 'Admin – Új meccs',
    layout: 'admin/layout',
    match: null,
    statuses: MATCH_STATUSES,
    errors: [],
  });
});

// Létrehozás
router.post('/', async (req, res, next) => {
  try {
    const { league, homeTeam, awayTeam, kickoffAt, status, note } = req.body;
    const errors = [];
    if (!homeTeam || !homeTeam.trim()) errors.push('A hazai csapat megadása kötelező.');
    if (!awayTeam || !awayTeam.trim()) errors.push('A vendég csapat megadása kötelező.');
    const kickoff = parseKickoff(kickoffAt);
    if (!kickoff) errors.push('Érvényes kezdési időpontot adj meg.');

    if (errors.length) {
      return res.status(400).render('admin/matches/form', {
        title: 'Admin – Új meccs',
        layout: 'admin/layout',
        match: { league, homeTeam, awayTeam, kickoffAt, status, note },
        statuses: MATCH_STATUSES,
        errors,
      });
    }

    const match = await prisma.match.create({
      data: {
        league: league ? league.trim() : null,
        homeTeam: homeTeam.trim(),
        awayTeam: awayTeam.trim(),
        kickoffAt: kickoff,
        status: MATCH_STATUSES[status] ? status : 'SCHEDULED',
        note: note ? note.trim() : null,
      },
    });
    req.flash('success', 'Meccs létrehozva.');
    res.redirect(`/admin/meccsek/${match.id}`);
  } catch (err) {
    next(err);
  }
});

// Meccs részletek + tippek + tipp hozzáadása űrlap
router.get('/:id', async (req, res, next) => {
  try {
    const match = await prisma.match.findUnique({
      where: { id: req.params.id },
      include: { tips: { orderBy: { createdAt: 'asc' } } },
    });
    if (!match) {
      return res.status(404).render('error', { title: 'Nincs meccs', message: 'A meccs nem található.' });
    }
    res.render('admin/matches/show', {
      title: `Admin – ${match.homeTeam} - ${match.awayTeam}`,
      layout: 'admin/layout',
      match,
      betTypes: BET_TYPES,
      betTypeOrder: BET_TYPE_ORDER,
      tierOrder: TIER_ORDER,
      tiers: TIERS,
    });
  } catch (err) {
    next(err);
  }
});

// Szerkesztés űrlap
router.get('/:id/szerkeszt', async (req, res, next) => {
  try {
    const match = await prisma.match.findUnique({ where: { id: req.params.id } });
    if (!match) {
      return res.status(404).render('error', { title: 'Nincs meccs', message: 'A meccs nem található.' });
    }
    res.render('admin/matches/form', {
      title: 'Admin – Meccs szerkesztése',
      layout: 'admin/layout',
      match,
      statuses: MATCH_STATUSES,
      errors: [],
    });
  } catch (err) {
    next(err);
  }
});

// Módosítás
router.post('/:id', async (req, res, next) => {
  try {
    const match = await prisma.match.findUnique({ where: { id: req.params.id } });
    if (!match) {
      return res.status(404).render('error', { title: 'Nincs meccs', message: 'A meccs nem található.' });
    }
    const { league, homeTeam, awayTeam, kickoffAt, status, note } = req.body;
    const kickoff = parseKickoff(kickoffAt) || match.kickoffAt;
    await prisma.match.update({
      where: { id: match.id },
      data: {
        league: league ? league.trim() : null,
        homeTeam: (homeTeam || match.homeTeam).trim(),
        awayTeam: (awayTeam || match.awayTeam).trim(),
        kickoffAt: kickoff,
        status: MATCH_STATUSES[status] ? status : match.status,
        note: note ? note.trim() : null,
      },
    });
    req.flash('success', 'Meccs frissítve.');
    res.redirect(`/admin/meccsek/${match.id}`);
  } catch (err) {
    next(err);
  }
});

// Törlés
router.post('/:id/torles', async (req, res, next) => {
  try {
    await prisma.match.delete({ where: { id: req.params.id } });
    req.flash('success', 'Meccs törölve.');
    res.redirect('/admin/meccsek');
  } catch (err) {
    next(err);
  }
});

// Tipp létrehozása a meccshez
router.post('/:id/tippek', async (req, res, next) => {
  try {
    const match = await prisma.match.findUnique({ where: { id: req.params.id } });
    if (!match) {
      return res.status(404).render('error', { title: 'Nincs meccs', message: 'A meccs nem található.' });
    }

    const { betType, selection, line, odds, confidence, stake, requiredTier, analysis } = req.body;
    if (!BET_TYPES[betType] || !selection || !selection.trim()) {
      req.flash('error', 'A fogadási típus és a tipp (selection) megadása kötelező.');
      return res.redirect(`/admin/meccsek/${match.id}`);
    }

    await prisma.tip.create({
      data: {
        matchId: match.id,
        betType,
        selection: selection.trim(),
        line: line ? parseFloat(line) : null,
        odds: odds ? parseFloat(odds) : null,
        confidence: confidence ? parseInt(confidence, 10) : null,
        stake: stake ? parseInt(stake, 10) : null,
        requiredTier: TIERS[requiredTier] ? requiredTier : 'BASIC',
        analysis: analysis ? analysis.trim() : null,
      },
    });
    req.flash('success', 'Tipp hozzáadva.');
    res.redirect(`/admin/meccsek/${match.id}`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
