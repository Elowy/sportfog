// A felhasználó aktuális hozzáférésének kiszámítása az AccessGrant rekordokból.
const { tierRank, tierLabel } = require('./domain');

// Visszaadja a felhasználó aktív (kifizetett és le nem járt) hozzáférését.
// effectiveRank: a legmagasabb aktív szint rangja (0, ha nincs aktív).
async function getActiveAccess(prisma, userId) {
  if (!userId) {
    return { active: false, tier: null, tierLabel: null, effectiveRank: 0, expiresAt: null, grants: [] };
  }

  const now = new Date();
  const grants = await prisma.accessGrant.findMany({
    where: { userId, status: 'PAID', expiresAt: { gt: now } },
    orderBy: { expiresAt: 'desc' },
  });

  if (grants.length === 0) {
    return { active: false, tier: null, tierLabel: null, effectiveRank: 0, expiresAt: null, grants: [] };
  }

  let best = grants[0];
  let bestRank = 0;
  let latestExpiry = null;
  for (const g of grants) {
    const r = tierRank(g.tier);
    if (r > bestRank) {
      bestRank = r;
      best = g;
    }
    if (!latestExpiry || g.expiresAt > latestExpiry) latestExpiry = g.expiresAt;
  }

  return {
    active: true,
    tier: best.tier,
    tierLabel: tierLabel(best.tier),
    effectiveRank: bestRank,
    // A legmagasabb szint lejárata (ameddig az adott szint elérhető):
    expiresAt: best.expiresAt,
    // A teljes hozzáférés vége (bármely szinten):
    latestExpiry,
    grants,
  };
}

module.exports = { getActiveAccess };
