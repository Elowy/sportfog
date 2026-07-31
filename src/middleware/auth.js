// Hitelesítési és jogosultsági middleware-ek.
const prisma = require('../db');
const { getActiveAccess } = require('../lib/access');

// Minden kérésnél betölti a bejelentkezett felhasználót és a hozzáférését,
// és elérhetővé teszi a nézetek számára (res.locals).
async function loadUser(req, res, next) {
  res.locals.currentUser = null;
  res.locals.access = { active: false, expiresAt: null };
  try {
    if (req.session && req.session.userId) {
      const user = await prisma.user.findUnique({ where: { id: req.session.userId } });
      if (user) {
        req.user = user;
        res.locals.currentUser = user;
        const access = await getActiveAccess(prisma, user.id);
        req.access = access;
        res.locals.access = access;
      } else {
        req.session.userId = null;
      }
    }
    next();
  } catch (err) {
    next(err);
  }
}

function requireAuth(req, res, next) {
  if (!req.user) {
    req.session.returnTo = req.originalUrl;
    req.flash('error', 'A folytatáshoz kérjük, jelentkezz be.');
    return res.redirect('/belepes');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    req.session.returnTo = req.originalUrl;
    req.flash('error', 'A folytatáshoz kérjük, jelentkezz be.');
    return res.redirect('/belepes');
  }
  if (req.user.role !== 'ADMIN') {
    return res.status(403).render('error', {
      title: 'Nincs jogosultság',
      message: 'Ehhez a művelethez adminisztrátori jogosultság szükséges.',
    });
  }
  next();
}

module.exports = { loadUser, requireAuth, requireAdmin };
