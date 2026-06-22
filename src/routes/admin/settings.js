// Admin: integrációs beállítások szerkesztése (a .env helyett / felett).
const express = require('express');
const router = express.Router();
const settings = require('../../services/settings');
const webpush = require('../../lib/webpush');

router.get('/', (req, res) => {
  res.render('admin/settings/index', {
    title: 'Admin – Beállítások',
    layout: 'admin/layout',
    groups: settings.groupedForAdmin(),
  });
});

router.post('/', async (req, res, next) => {
  try {
    const has = (k) => Object.prototype.hasOwnProperty.call(req.body, k);
    const changes = {};
    for (const d of settings.DEFS) {
      if (d.type === 'bool') {
        // A bool mezőket csak akkor írjuk, ha az űrlap tartalmazza a csoportot.
        // (A checkbox hiánya = kikapcsolva, de csak elküldött űrlapnál.)
        if (has('__group_' + d.group) || has(d.key)) changes[d.key] = req.body[d.key] === 'on' ? 'true' : 'false';
      } else if (d.type === 'password') {
        // Üres jelszó = változatlan (nem írjuk felül).
        const v = req.body[d.key];
        if (v && v.trim() !== '') changes[d.key] = v.trim();
      } else if (has(d.key)) {
        // Szöveges mező: csak ha az űrlapon szerepelt (így a részleges
        // beküldés nem törli a többi értéket).
        changes[d.key] = (req.body[d.key] || '').trim();
      }
    }
    await settings.setMany(changes);
    req.flash('success', 'Beállítások mentve.');
    res.redirect('/admin/beallitasok');
  } catch (err) {
    next(err);
  }
});

// VAPID kulcspár generálása a Web Pushhoz.
router.post('/vapid', async (req, res, next) => {
  try {
    const keys = webpush.generateKeys();
    await settings.setMany({ VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey });
    req.flash('success', 'Új VAPID kulcspár generálva és elmentve.');
    res.redirect('/admin/beallitasok');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
