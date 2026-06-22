// Értesítések több csatornán: e-mail, Telegram, Messenger, Web Push.
// Tartalmazza a fiók-összekapcsolást (Telegram/Messenger) és a leiratkozást is.
const crypto = require('crypto');
const prisma = require('../db');
const config = require('../config');
const email = require('../lib/email');
const telegram = require('../lib/telegram');
const messenger = require('../lib/messenger');
const webpush = require('../lib/webpush');
const { getActiveAccess } = require('../lib/access');
const { tierRank, betTypeLabel, formatDateTime } = require('../lib/domain');

const STOP_WORDS = ['stop', 'leiratkozas', 'leiratkozás', '/stop', 'leallitas', 'leállítás'];

function channelStatus() {
  return {
    email: email.isEnabled(),
    telegram: telegram.isEnabled(),
    messenger: messenger.isEnabled(),
    webpush: webpush.isEnabled(),
  };
}

function anyChannelEnabled() {
  const c = channelStatus();
  return c.email || c.telegram || c.messenger || c.webpush;
}

// --- Összekötő kód -------------------------------------------------------
async function ensureLinkCode(user) {
  if (user.linkCode) return user;
  let code, ok = false, attempts = 0;
  while (!ok && attempts < 10) {
    code = genCode();
    const exists = await prisma.user.findUnique({ where: { linkCode: code } });
    if (!exists) ok = true;
    attempts++;
  }
  return prisma.user.update({ where: { id: user.id }, data: { linkCode: code } });
}

function genCode() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)];
  return `SPORT-${s}`;
}

// Csatorna összekapcsolása a begépelt kód alapján.
// channel: 'messenger' | 'telegram'. Az externalId a PSID / chatId.
async function linkChannel(channel, externalId, rawCode) {
  const idField = channel === 'telegram' ? 'telegramChatId' : 'messengerPsid';
  const flagField = channel === 'telegram' ? 'notifyTelegram' : 'notifyMessenger';

  const existing = await prisma.user.findFirst({ where: { [idField]: String(externalId) } });
  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: { [flagField]: true } });
    return { alreadyLinked: true, user: existing };
  }

  const code = (rawCode || '').trim().toUpperCase();
  if (!code) return { linked: false };
  const user = await prisma.user.findUnique({ where: { linkCode: code } });
  if (!user) return { linked: false };

  await prisma.user.update({
    where: { id: user.id },
    data: { [idField]: String(externalId), [flagField]: true },
  });
  return { linked: true, user };
}

// --- Bejövő üzenetek webhookból -----------------------------------------
async function handleMessengerEvent(event) {
  const psid = event.sender && event.sender.id;
  if (!psid) return;
  let text = (event.message && event.message.text) || (event.postback && event.postback.payload) || (event.referral && event.referral.ref) || '';
  if (event.postback && event.postback.referral && event.postback.referral.ref) text = event.postback.referral.ref;
  text = (text || '').trim();

  if (STOP_WORDS.includes(text.toLowerCase())) {
    await prisma.user.updateMany({ where: { messengerPsid: psid }, data: { notifyMessenger: false } });
    return messenger.sendText(psid, 'Leiratkoztál a Messenger értesítésekről. Bármikor visszakapcsolhatod a Fiókom oldalon. 👋');
  }
  if (!text) return messenger.sendText(psid, 'Szia! 👋 Küldd el a Sportfog összekötő kódodat (Fiókom → Értesítések).');

  const r = await linkChannel('messenger', psid, text);
  if (r.linked) return messenger.sendText(psid, `✅ Összekapcsolva (${r.user.email})! Mostantól itt kapod az új tippeket. Leiratkozás: STOP.`);
  if (r.alreadyLinked) return messenger.sendText(psid, 'Ez a fiók már össze van kapcsolva. ✅');
  return messenger.sendText(psid, 'Nem találtam ilyen kódot 🤔 A kódot a Fiókom → Értesítések résznél találod.');
}

async function handleTelegramUpdate(update) {
  const msg = update.message || update.edited_message;
  if (!msg || !msg.chat) return;
  const chatId = msg.chat.id;
  let text = (msg.text || '').trim();
  if (text.startsWith('/start')) text = text.slice(6).trim();

  if (STOP_WORDS.includes(text.toLowerCase()) || (msg.text || '').trim().toLowerCase() === '/stop') {
    await prisma.user.updateMany({ where: { telegramChatId: String(chatId) }, data: { notifyTelegram: false } });
    return telegram.sendMessage(chatId, 'Leiratkoztál a Telegram értesítésekről. Bármikor visszakapcsolhatod a Fiókom oldalon. 👋');
  }
  if (!text) return telegram.sendMessage(chatId, 'Szia! 👋 Küldd el a Sportfog összekötő kódodat (Fiókom → Értesítések), vagy nyisd meg az oldalon a Telegram-gombot.');

  const r = await linkChannel('telegram', chatId, text);
  if (r.linked) return telegram.sendMessage(chatId, `✅ Összekapcsolva (${r.user.email})! Mostantól itt kapod az új tippeket. Leiratkozás: /stop`);
  if (r.alreadyLinked) return telegram.sendMessage(chatId, 'Ez a fiók már össze van kapcsolva. ✅');
  return telegram.sendMessage(chatId, 'Nem találtam ilyen kódot 🤔 A kódot a Fiókom → Értesítések résznél találod.');
}

// --- Kézbesítés egy felhasználónak --------------------------------------
function plain(payload) {
  return `${payload.title}\n${payload.text}${payload.url ? '\n' + payload.url : ''}`;
}

function unsubToken(userId) {
  return crypto.createHmac('sha256', config.sessionSecret).update('unsub:' + userId).digest('hex').slice(0, 32);
}

function unsubLink(user) {
  return `${config.baseUrl}/leiratkozas?u=${user.id}&t=${unsubToken(user.id)}`;
}

async function sendWebPush(user, payload) {
  const subs = await prisma.pushSubscription.findMany({ where: { userId: user.id } });
  let sent = 0;
  for (const sub of subs) {
    const r = await webpush.sendToSub(sub, { title: payload.title, body: payload.text, url: payload.url || config.baseUrl });
    if (r.success) sent++;
    else if (r.gone) await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
  }
  return sent;
}

// payload: { title, text, url }. only: opcionális csatorna-szűrő tömb.
async function dispatchToUser(user, payload, only) {
  const allow = (ch) => !only || only.includes(ch);
  let sent = 0;
  if (allow('email') && user.notifyEmail && email.isEnabled() && user.email) {
    const text = `${payload.text}${payload.url ? '\n\n' + payload.url : ''}\n\nLeiratkozás: ${unsubLink(user)}`;
    const r = await email.sendMail({ to: user.email, subject: payload.title, text });
    if (r.success) sent++;
  }
  if (allow('telegram') && user.notifyTelegram && telegram.isEnabled() && user.telegramChatId) {
    const r = await telegram.sendMessage(user.telegramChatId, plain(payload));
    if (r.success) sent++;
  }
  if (allow('messenger') && user.notifyMessenger && messenger.isEnabled() && user.messengerPsid) {
    const r = await messenger.sendText(user.messengerPsid, plain(payload));
    if (r.success) sent++;
  }
  if (allow('webpush') && user.notifyWebPush && webpush.isEnabled()) {
    sent += await sendWebPush(user, payload);
  }
  return sent;
}

// --- Új tipp értesítő ----------------------------------------------------
async function notifyNewTip(tipId) {
  const tip = await prisma.tip.findUnique({ where: { id: tipId }, include: { match: true } });
  if (!tip) return { users: 0, sent: 0 };

  const recipients = await prisma.user.findMany({
    where: { OR: [{ notifyEmail: true }, { notifyTelegram: true }, { notifyMessenger: true }, { notifyWebPush: true }] },
  });

  const required = tierRank(tip.requiredTier);
  const m = tip.match;
  const lineTxt = tip.line !== null && tip.line !== undefined ? ` (${tip.line})` : '';
  const oddsTxt = tip.odds ? ` @ ${tip.odds.toFixed(2)}` : '';
  const payload = {
    title: '⚽ Új sportfogadási tipp',
    text: `${m.homeTeam} – ${m.awayTeam}${m.league ? ' (' + m.league + ')' : ''}\nKezdés: ${formatDateTime(m.kickoffAt)}\n${betTypeLabel(tip.betType)}: ${tip.selection}${lineTxt}${oddsTxt}`,
    url: `${config.baseUrl}/tippek`,
  };

  let users = 0, sent = 0;
  for (const user of recipients) {
    const access = await getActiveAccess(prisma, user.id);
    if (!access.active || access.effectiveRank < required) continue;
    const s = await dispatchToUser(user, payload);
    if (s > 0) { users++; sent += s; }
  }
  return { users, sent };
}

// --- Admin kézi körüzenet ------------------------------------------------
// audience: 'all' | 'active' | 'BASIC'|'PREMIUM'|'VIP'. channels: csatorna-szűrő.
async function broadcast({ audience, channels, title, text }) {
  if (!text || !text.trim()) return { users: 0, sent: 0, error: 'Üres üzenet.' };
  const recipients = await prisma.user.findMany({
    where: { OR: [{ notifyEmail: true }, { notifyTelegram: true }, { notifyMessenger: true }, { notifyWebPush: true }] },
  });

  const payload = { title: title && title.trim() ? title.trim() : 'Sportfog értesítés', text: text.trim(), url: config.baseUrl };
  let users = 0, sent = 0;
  for (const user of recipients) {
    if (audience !== 'all') {
      const access = await getActiveAccess(prisma, user.id);
      if (audience === 'active' && !access.active) continue;
      if (['BASIC', 'PREMIUM', 'VIP'].includes(audience) && access.effectiveRank < tierRank(audience)) continue;
    }
    const s = await dispatchToUser(user, payload, channels && channels.length ? channels : null);
    if (s > 0) { users++; sent += s; }
  }
  return { users, sent };
}

module.exports = {
  ensureLinkCode,
  linkChannel,
  handleMessengerEvent,
  handleTelegramUpdate,
  notifyNewTip,
  broadcast,
  unsubToken,
  channelStatus,
  anyChannelEnabled,
};
