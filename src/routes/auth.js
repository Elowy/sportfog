// Regisztráció, bejelentkezés, kijelentkezés.
const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const prisma = require('../db');

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

router.get('/regisztracio', (req, res) => {
  if (req.user) return res.redirect('/fiok');
  res.render('auth/register', { title: 'Regisztráció', values: {} });
});

router.post('/regisztracio', async (req, res, next) => {
  try {
    const name = (req.body.name || '').trim();
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';
    const password2 = req.body.password2 || '';

    const errors = [];
    if (!name) errors.push('A név megadása kötelező.');
    if (!isValidEmail(email)) errors.push('Érvényes e-mail címet adj meg.');
    if (password.length < 8) errors.push('A jelszó legalább 8 karakter legyen.');
    if (password !== password2) errors.push('A két jelszó nem egyezik.');

    if (errors.length === 0) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) errors.push('Ezzel az e-mail címmel már létezik fiók.');
    }

    if (errors.length > 0) {
      return res.status(400).render('auth/register', {
        title: 'Regisztráció',
        errors,
        values: { name, email },
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({ data: { name, email, passwordHash } });
    req.session.userId = user.id;
    req.flash('success', 'Sikeres regisztráció! Üdvözlünk a Sportfogon.');
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
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';

    const user = await prisma.user.findUnique({ where: { email } });
    const ok = user && (await bcrypt.compare(password, user.passwordHash));
    if (!ok) {
      return res.status(401).render('auth/login', {
        title: 'Bejelentkezés',
        errors: ['Hibás e-mail cím vagy jelszó.'],
        values: { email },
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
