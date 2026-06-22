// Flash üzenetek és egyszerű CSRF-védelem session alapon.
const crypto = require('crypto');

// Flash: req.flash(type, msg) eltárolja a session-be, a következő kérésnél
// a res.locals.flash-en keresztül elérhető, majd törlődik.
function flash(req, res, next) {
  if (!req.session.flash) req.session.flash = [];
  req.flash = (type, message) => {
    req.session.flash.push({ type, message });
  };
  res.locals.flash = req.session.flash;
  req.session.flash = [];
  next();
}

// CSRF token a session-höz kötve. A nézetek a res.locals.csrfToken-t teszik
// rejtett mezőbe, a middleware pedig minden állapotváltó kérésnél ellenőrzi.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function csrf(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;

  if (SAFE_METHODS.has(req.method)) return next();

  const provided = (req.body && req.body._csrf) || req.get('x-csrf-token');
  if (!provided || provided !== req.session.csrfToken) {
    return res.status(403).render('error', {
      title: 'Érvénytelen kérés',
      message: 'A biztonsági token érvénytelen vagy lejárt. Töltsd be újra az oldalt, és próbáld újra.',
    });
  }
  next();
}

module.exports = { flash, csrf };
