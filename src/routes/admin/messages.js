// Admin: kézi Messenger körüzenet küldése.
const express = require('express');
const router = express.Router();
const prisma = require('../../db');
const messenger = require('../../lib/messenger');
const { broadcast } = require('../../services/notifications');

async function counts() {
  const [linked, optedIn] = await Promise.all([
    prisma.user.count({ where: { messengerPsid: { not: null } } }),
    prisma.user.count({ where: { messengerPsid: { not: null }, messengerOptIn: true } }),
  ]);
  return { linked, optedIn };
}

router.get('/', async (req, res, next) => {
  try {
    res.render('admin/messages/index', {
      title: 'Admin – Messenger üzenetek',
      layout: 'admin/layout',
      messengerEnabled: messenger.isEnabled(),
      stats: await counts(),
      result: null,
      sentText: '',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const audience = ['linked', 'active', 'BASIC', 'PREMIUM', 'VIP'].includes(req.body.audience)
      ? req.body.audience
      : 'linked';
    const text = (req.body.text || '').trim();

    let result = null;
    if (!messenger.isEnabled()) {
      req.flash('error', 'A Messenger nincs beállítva.');
    } else if (!text) {
      req.flash('error', 'Az üzenet nem lehet üres.');
    } else {
      result = await broadcast({ audience, text });
      req.flash('success', `Körüzenet kész: ${result.sent} elküldve, ${result.failed} hiba (${result.total} címzett).`);
    }

    res.render('admin/messages/index', {
      title: 'Admin – Messenger üzenetek',
      layout: 'admin/layout',
      messengerEnabled: messenger.isEnabled(),
      stats: await counts(),
      result,
      sentText: text,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
