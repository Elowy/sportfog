// Felhasználói fiók: hozzáférés, vásárlási előzmények, Messenger összekapcsolás.
const express = require('express');
const router = express.Router();
const prisma = require('../db');
const config = require('../config');
const messenger = require('../lib/messenger');
const { requireAuth } = require('../middleware/auth');
const { ensureLinkCode } = require('../services/notifications');

router.get('/', requireAuth, async (req, res, next) => {
  try {
    let user = req.user;
    if (messenger.isEnabled()) {
      user = await ensureLinkCode(user);
    }

    const grants = await prisma.accessGrant.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: { plan: true },
    });

    res.render('account/index', {
      title: 'Fiókom',
      user,
      grants,
      messengerEnabled: messenger.isEnabled(),
      mMeLink: config.messenger.mMeLink,
    });
  } catch (err) {
    next(err);
  }
});

// Új összekötő kód generálása (ha még nincs összekapcsolva).
router.post('/messenger/ujkod', requireAuth, async (req, res, next) => {
  try {
    if (req.user.messengerPsid) {
      req.flash('error', 'A fiókod már össze van kapcsolva a Messengerrel.');
      return res.redirect('/fiok');
    }
    await prisma.user.update({ where: { id: req.user.id }, data: { messengerLinkCode: null } });
    await ensureLinkCode({ ...req.user, messengerLinkCode: null });
    req.flash('success', 'Új összekötő kódot generáltunk.');
    res.redirect('/fiok');
  } catch (err) {
    next(err);
  }
});

// Messenger leválasztása.
router.post('/messenger/levalaszt', requireAuth, async (req, res, next) => {
  try {
    await prisma.user.update({
      where: { id: req.user.id },
      data: { messengerPsid: null, messengerLinkedAt: null, messengerOptIn: true, messengerLinkCode: null },
    });
    req.flash('success', 'A Messenger összekapcsolást megszüntettük.');
    res.redirect('/fiok');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
