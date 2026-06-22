// Admin: kézi körüzenet több csatornán (e-mail / Telegram / Messenger / web push).
const express = require('express');
const router = express.Router();
const prisma = require('../../db');
const notifications = require('../../services/notifications');

async function stats() {
  const [emailOn, telegramOn, messengerOn, webpushOn] = await Promise.all([
    prisma.user.count({ where: { notifyEmail: true } }),
    prisma.user.count({ where: { notifyTelegram: true, telegramChatId: { not: null } } }),
    prisma.user.count({ where: { notifyMessenger: true, messengerPsid: { not: null } } }),
    prisma.user.count({ where: { notifyWebPush: true } }),
  ]);
  return { emailOn, telegramOn, messengerOn, webpushOn };
}

function viewData(extra) {
  return Object.assign({
    title: 'Admin – Üzenetek',
    layout: 'admin/layout',
    channelStatus: notifications.channelStatus(),
    anyChannel: notifications.anyChannelEnabled(),
  }, extra);
}

router.get('/', async (req, res, next) => {
  try {
    res.render('admin/messages/index', viewData({ stats: await stats(), result: null, sent: { title: '', text: '' } }));
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const audience = ['all', 'active', 'BASIC', 'PREMIUM', 'VIP'].includes(req.body.audience) ? req.body.audience : 'all';
    const title = (req.body.title || '').trim();
    const text = (req.body.text || '').trim();
    const channels = ['email', 'telegram', 'messenger', 'webpush'].filter((c) => req.body['ch_' + c] === 'on');

    let result = null;
    if (!notifications.anyChannelEnabled()) {
      req.flash('error', 'Nincs beállított értesítési csatorna.');
    } else if (!text) {
      req.flash('error', 'Az üzenet nem lehet üres.');
    } else {
      result = await notifications.broadcast({ audience, channels, title, text });
      req.flash('success', `Körüzenet kész: ${result.users} felhasználó, ${result.sent} üzenet elküldve.`);
    }

    res.render('admin/messages/index', viewData({ stats: await stats(), result, sent: { title, text } }));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
