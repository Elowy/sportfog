// Részletes tipp-statisztika a Fiókomból elérhetően.
// Havi / liga / csapat / típus szerinti bontás, szűrhető korábbi meccsekkel.
const express = require('express');
const router = express.Router();
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
const { summarize, groupSummarize } = require('../lib/stats');
const { BET_TYPE_ORDER, betTypeLabel } = require('../lib/domain');

const SETTLED = ['WON', 'LOST', 'VOID'];

function monthKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('hu-HU', { year: 'numeric', month: 'long' }).format(new Date(y, m - 1, 1));
}

// Az elmúlt 6 hónap gyors-választóhoz.
function recentMonths(n) {
  const out = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push({ key, label: monthLabel(key) });
  }
  return out;
}

function monthRange(key) {
  const [y, m] = key.split('-').map(Number);
  return { from: new Date(y, m - 1, 1, 0, 0, 0), to: new Date(y, m, 0, 23, 59, 59) };
}

router.get('/', requireAuth, async (req, res, next) => {
  try {
    // Szűrők
    const honap = /^\d{4}-\d{2}$/.test(req.query.honap || '') ? req.query.honap : '';
    let from = req.query.tol ? new Date(req.query.tol) : null;
    let to = req.query.ig ? new Date(req.query.ig) : null;
    if (honap) { const r = monthRange(honap); from = r.from; to = r.to; }
    if (from && isNaN(from.getTime())) from = null;
    if (to && isNaN(to.getTime())) to = null;
    if (to) to.setHours(23, 59, 59, 999);

    const liga = (req.query.liga || '').trim();
    const csapat = (req.query.csapat || '').trim();
    const tipus = BET_TYPE_ORDER.includes(req.query.tipus) ? req.query.tipus : '';
    const bontas = ['honap', 'liga', 'csapat', 'tipus'].includes(req.query.bontas) ? req.query.bontas : 'honap';

    // Meccs-szűrő
    const matchWhere = { AND: [] };
    const kickoff = {};
    if (from) kickoff.gte = from;
    if (to) kickoff.lte = to;
    if (Object.keys(kickoff).length) matchWhere.AND.push({ kickoffAt: kickoff });
    if (liga) matchWhere.AND.push({ league: liga });
    if (csapat) matchWhere.AND.push({ OR: [{ homeTeam: csapat }, { awayTeam: csapat }] });
    if (matchWhere.AND.length === 0) delete matchWhere.AND;

    const tipWhere = { result: { in: SETTLED } };
    if (tipus) tipWhere.betType = tipus;

    const matches = await prisma.match.findMany({
      where: matchWhere,
      include: { tips: { where: tipWhere, orderBy: { createdAt: 'asc' } } },
      orderBy: { kickoffAt: 'desc' },
    });

    // Csak a lezárt tippet tartalmazó meccsek relevánsak.
    const detailMatches = matches.filter((m) => m.tips.length > 0);
    const rows = detailMatches.flatMap((m) => m.tips.map((t) => ({ match: m, tip: t })));

    const summary = summarize(rows.map((r) => r.tip));

    // Bontás
    let groups;
    if (bontas === 'honap') {
      groups = groupSummarize(rows, (r) => monthKey(r.match.kickoffAt)).map((g) => ({ ...g, label: monthLabel(g.key) }));
      groups.sort((a, b) => (a.key < b.key ? 1 : -1));
    } else if (bontas === 'liga') {
      groups = groupSummarize(rows, (r) => r.match.league || 'Egyéb').map((g) => ({ ...g, label: g.key }));
      groups.sort((a, b) => b.total - a.total);
    } else if (bontas === 'csapat') {
      groups = groupSummarize(rows, (r) => [r.match.homeTeam, r.match.awayTeam]).map((g) => ({ ...g, label: g.key }));
      groups.sort((a, b) => b.total - a.total);
    } else {
      groups = groupSummarize(rows, (r) => r.tip.betType).map((g) => ({ ...g, label: betTypeLabel(g.key) }));
      groups.sort((a, b) => b.total - a.total);
    }

    // Szűrő-opciók
    const leagueRows = await prisma.match.findMany({ where: { league: { not: null } }, distinct: ['league'], select: { league: true }, orderBy: { league: 'asc' } });
    const leagues = leagueRows.map((r) => r.league).filter(Boolean);
    const teamRows = await prisma.match.findMany({ select: { homeTeam: true, awayTeam: true } });
    const teamSet = new Set();
    teamRows.forEach((r) => { teamSet.add(r.homeTeam); teamSet.add(r.awayTeam); });
    const teams = Array.from(teamSet).sort((a, b) => a.localeCompare(b, 'hu'));

    res.render('stats/index', {
      title: 'Statisztika',
      summary,
      groups,
      bontas,
      detailMatches: detailMatches.slice(0, 100),
      filters: { honap, tol: req.query.tol || '', ig: req.query.ig || '', liga, csapat, tipus },
      leagues,
      teams,
      betTypeOrder: BET_TYPE_ORDER,
      months: recentMonths(6),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
