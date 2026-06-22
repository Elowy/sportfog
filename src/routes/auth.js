// Regisztráció, bejelentkezés, kijelentkezés.
const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const prisma = require('../db');
const email = require('../lib/email');
const telegram = require('../lib/telegram');
const messenger = require('../lib/messenger');
const webpush = require('../lib/webpush');

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// Mely értesítési csatornák érhetők el (be vannak állítva)?
function channelAvail() {
  return {
    email: email.isEnabled(),
    telegram: telegram.isEnabled(),
    messenger: messenger.isEnabled(),
    webpush: webpush.isEnabled(),
    any: email.isEnabled() || telegram.isEnabled() || messenger.isEnabled() || webpush.isEnabled(),
  };
}

router.get('/regisztracio', (req, res) => {
  if (req.user) return res.redirect('/fiok');
  res.render('auth/register', { title: 'Regisztráció', values: {}, channelAvail: channelAvail() });
});

router.post('/regisztracio', async (req, res, next) => {
  try {
    const name = (req.body.name || '').trim();
    const emailAddr = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';
    const password2 = req.body.password2 || '';

    const errors = [];
    if (!name) errors.push('A név megadása kötelező.');
    if (!isValidEmail(emailAddr)) errors.push('Érvényes e-mail címet adj meg.');
    if (password.length < 8) errors.push('A jelszó legalább 8 karakter legyen.');
    if (password !== password2) errors.push('A két jelszó nem egyezik.');

    if (errors.length === 0) {
      const existing = await prisma.user.findUnique({ where: { email: emailAddr } });
      if (existing) errors.push('Ezzel az e-mail címmel már létezik fiók.');
    }

    if (errors.length > 0) {
      return res.status(400).render('auth/register', {
        title: 'Regisztráció',
        errors,
        values: { name, email: emailAddr },
        channelAvail: channelAvail(),
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        name,
        email: emailAddr,
        passwordHash,
        notifyEmail: req.body.notifyEmail === 'on',
        notifyTelegram: req.body.notifyTelegram === 'on',
        notifyMessenger: req.body.notifyMessenger === 'on',
        notifyWebPush: req.body.notifyWebPush === 'on',
      },
    });
    req.session.userId = user.id;

    const needsLink = (req.body.notifyTelegram === 'on') || (req.body.notifyMessenger === 'on') || (req.body.notifyWebPush === 'on');
    req.flash('success', 'Sikeres regisztráció! Üdvözlünk a Sportfogon.');
    if (needsLink) {
      req.flash('info', 'Az értesítések aktiválásához kapcsold össze a csatornákat a Fiókom → Értesítések résznél.');
    }
    res.redirect('/elofizetes');
  } catch (err) {
    next(err);
  }
});

router.get('/belepes', (req, res) => {
  if (req.user) return res.redirect('/fiok');
  res.render('auth/login', { title: 'Bejelentkezés', values: {} });
});

router.post('/belepes', async (req, res, next) => {
  try {
    const emailAddr = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';

    const user = await prisma.user.findUnique({ where: { email: emailAddr } });
    const ok = user && (await bcrypt.compare(password, user.passwordHash));
    if (!ok) {
      return res.status(401).render('auth/login', {
        title: 'Bejelentkezés',
        errors: ['Hibás e-mail cím vagy jelszó.'],
        values: { email: emailAddr },
      });
    }

    req.session.userId = user.id;
    const returnTo = req.session.returnTo;
    req.session.returnTo = null;
    req.flash('success', 'Sikeres bejelentkezés.');
    res.redirect(returnTo || (user.role === 'ADMIN' ? '/admin' : '/tippek'));
  } catch (err) {
    next(err);
  }
});

router.post('/kilepes', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

module.exports = router;
