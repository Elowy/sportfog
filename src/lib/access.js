// A felhasználó aktuális hozzáférésének kiszámítása az AccessGrant rekordokból.
// Egy csomag van (nincs szint): a hozzáférés aktív, ha van kifizetett és le nem
// járt rekord; az érvényesség a legkésőbbi lejáratig tart.

async function getActiveAccess(prisma, userId) {
  if (!userId) {
    return { active: false, expiresAt: null, grants: [] };
  }

  const now = new Date();
  const grants = await prisma.accessGrant.findMany({
    where: { userId, status: 'PAID', expiresAt: { gt: now } },
    orderBy: { expiresAt: 'desc' },
  });

  if (grants.length === 0) {
    return { active: false, expiresAt: null, grants: [] };
  }

  return {
    active: true,
    expiresAt: grants[0].expiresAt, // a legkésőbbi lejárat
    grants,
  };
}

module.exports = { getActiveAccess };
