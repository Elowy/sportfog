// Felhasználói fiók: hozzáférés, vásárlások, értesítési csatornák kezelése.
const express = require('express');
const router = express.Router();
const prisma = require('../db');
const messenger = require('../lib/messenger');
const telegram = require('../lib/telegram');
const email = require('../lib/email');
const webpush = require('../lib/webpush');
const { requireAuth } = require('../middleware/auth');
const { ensureLinkCode } = require('../services/notifications');

router.get('/', requireAuth, async (req, res, next) => {
  try {
    let user = req.user;
    if (messenger.isEnabled() || telegram.isEnabled()) {
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
      channels: {
        email: email.isEnabled(),
        telegram: telegram.isEnabled(),
        messenger: messenger.isEnabled(),
        webpush: webpush.isEnabled(),
        any: email.isEnabled() || telegram.isEnabled() || messenger.isEnabled() || webpush.isEnabled(),
      },
      mMeLink: messenger.mMeLink(),
      tgLink: telegram.botLink(user.linkCode),
      vapidPublicKey: webpush.publicKey(),
    });
  } catch (err) {
    next(err);
  }
});

// Értesítési preferenciák mentése (be-/kikapcsolás csatornánként).
router.post('/ertesitesek', requireAuth, async (req, res, next) => {
  try {
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        notifyEmail: req.body.notifyEmail === 'on',
        notifyTelegram: req.body.notifyTelegram === 'on',
        notifyMessenger: req.body.notifyMessenger === 'on',
        notifyWebPush: req.body.notifyWebPush === 'on',
      },
    });
    req.flash('success', 'Értesítési beállítások mentve.');
    res.redirect('/fiok');
  } catch (err) {
    next(err);
  }
});

// Új összekötő kód.
router.post('/kod/uj', requireAuth, async (req, res, next) => {
  try {
    await prisma.user.update({ where: { id: req.user.id }, data: { linkCode: null } });
    await ensureLinkCode({ ...req.user, linkCode: null });
    req.flash('success', 'Új összekötő kódot generáltunk.');
    res.redirect('/fiok');
  } catch (err) {
    next(err);
  }
});

router.post('/messenger/levalaszt', requireAuth, async (req, res, next) => {
  try {
    await prisma.user.update({ where: { id: req.user.id }, data: { messengerPsid: null, notifyMessenger: false } });
    req.flash('success', 'Messenger leválasztva.');
    res.redirect('/fiok');
  } catch (err) {
    next(err);
  }
});

router.post('/telegram/levalaszt', requireAuth, async (req, res, next) => {
  try {
    await prisma.user.update({ where: { id: req.user.id }, data: { telegramChatId: null, notifyTelegram: false } });
    req.flash('success', 'Telegram leválasztva.');
    res.redirect('/fiok');
  } catch (err) {
    next(err);
  }
});

// --- Web Push (JSON, a böngészőből, x-csrf-token fejléccel) ---------------
router.post('/push/feliratkozas', requireAuth, async (req, res, next) => {
  try {
    const sub = req.body || {};
    if (!sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
      return res.status(400).json({ error: 'Hiányos feliratkozás.' });
    }
    await prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      update: { userId: req.user.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      create: { userId: req.user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    });
    await prisma.user.update({ where: { id: req.user.id }, data: { notifyWebPush: true } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/push/leiratkozas', requireAuth, async (req, res, next) => {
  try {
    const endpoint = req.body && req.body.endpoint;
    if (endpoint) await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: req.user.id } });
    const remaining = await prisma.pushSubscription.count({ where: { userId: req.user.id } });
    if (remaining === 0) await prisma.user.update({ where: { id: req.user.id }, data: { notifyWebPush: false } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
