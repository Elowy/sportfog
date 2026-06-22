// Messenger értesítések: fiók-összekapcsolás, új tipp értesítő, kézi körüzenet.
const prisma = require('../db');
const messenger = require('../lib/messenger');
const config = require('../config');
const { getActiveAccess } = require('../lib/access');
const { tierRank, betTypeLabel, tierLabel, formatDateTime } = require('../lib/domain');

const STOP_WORDS = ['stop', 'leiratkozas', 'leiratkozás', 'leallitas', 'leállítás'];

// Egy bejövő Messenger esemény feldolgozása (üzenet / postback / referral).
async function handleMessengerEvent(event) {
  const psid = event.sender && event.sender.id;
  if (!psid) return;

  let text = '';
  if (event.message && event.message.text) text = event.message.text;
  else if (event.postback && event.postback.payload) text = event.postback.payload;
  else if (event.referral && event.referral.ref) text = event.referral.ref;
  if (event.postback && event.postback.referral && event.postback.referral.ref) {
    text = event.postback.referral.ref;
  }
  text = (text || '').trim();
  if (!text) {
    await messenger.sendText(psid, 'Szia! 👋 Add meg a Sportfog összekötő kódodat (a Fiókom > Messenger résznél találod).');
    return;
  }

  if (STOP_WORDS.includes(text.toLowerCase())) {
    await prisma.user.updateMany({ where: { messengerPsid: psid }, data: { messengerOptIn: false } });
    await messenger.sendText(psid, 'Leiratkoztál a Sportfog értesítésekről. Bármikor visszakapcsolhatod a Fiókom oldalon. 👋');
    return;
  }

  const result = await linkByCode(psid, text);
  if (result.linked) {
    await messenger.sendText(psid, `✅ Sikeresen összekapcsoltad a Sportfog fiókodat (${result.user.email})! Mostantól itt kapod az új tippeket. Leiratkozás: írd, hogy STOP.`);
  } else if (result.alreadyLinked) {
    await messenger.sendText(psid, 'Ez a fiók már össze van kapcsolva. ✅ Új tipp esetén értesítünk!');
  } else {
    await messenger.sendText(psid, 'Nem találtam ilyen kódot 🤔 A pontos kódot a Sportfog oldalon, a Fiókom → Messenger résznél találod.');
  }
}

// Fiók összekapcsolása a begépelt kód alapján.
async function linkByCode(psid, rawText) {
  const code = rawText.trim().toUpperCase();

  // Már össze van kötve ez a PSID?
  const existingByPsid = await prisma.user.findUnique({ where: { messengerPsid: psid } });
  if (existingByPsid) {
    await prisma.user.update({ where: { id: existingByPsid.id }, data: { messengerOptIn: true } });
    return { alreadyLinked: true, user: existingByPsid };
  }

  const user = await prisma.user.findUnique({ where: { messengerLinkCode: code } });
  if (!user) return { linked: false };

  await prisma.user.update({
    where: { id: user.id },
    data: {
      messengerPsid: psid,
      messengerLinkedAt: new Date(),
      messengerLinkCode: null, // a kód elhasználódott
      messengerOptIn: true,
    },
  });
  return { linked: true, user };
}

// Új tipp értesítő a jogosult, összekapcsolt felhasználóknak.
async function notifyNewTip(tipId) {
  if (!messenger.isEnabled()) return { sent: 0, skipped: 0, failed: 0 };

  const tip = await prisma.tip.findUnique({ where: { id: tipId }, include: { match: true } });
  if (!tip) return { sent: 0, skipped: 0, failed: 0 };

  const recipients = await prisma.user.findMany({
    where: { messengerPsid: { not: null }, messengerOptIn: true },
  });

  const required = tierRank(tip.requiredTier);
  const m = tip.match;
  const lineTxt = tip.line !== null && tip.line !== undefined ? ` (${tip.line})` : '';
  const oddsTxt = tip.odds ? ` @ ${tip.odds.toFixed(2)}` : '';
  const message =
    `⚽ Új tipp!\n${m.homeTeam} – ${m.awayTeam}${m.league ? ' (' + m.league + ')' : ''}\n` +
    `Kezdés: ${formatDateTime(m.kickoffAt)}\n` +
    `${betTypeLabel(tip.betType)}: ${tip.selection}${lineTxt}${oddsTxt}\n` +
    `Részletek: ${config.baseUrl}/tippek`;

  let sent = 0, skipped = 0, failed = 0;
  for (const user of recipients) {
    const access = await getActiveAccess(prisma, user.id);
    if (!access.active || access.effectiveRank < required) { skipped++; continue; }
    const res = await messenger.sendText(user.messengerPsid, message);
    if (res.success) sent++; else { failed++; console.warn(`Messenger küldés sikertelen (${user.email}): ${res.error}`); }
  }
  return { sent, skipped, failed };
}

// Kézi körüzenet az adminból.
// audience: 'linked' (összes összekapcsolt) | 'active' (aktív előfizető) | 'BASIC'|'PREMIUM'|'VIP'
async function broadcast({ audience, text }) {
  if (!messenger.isEnabled()) return { sent: 0, failed: 0, total: 0, error: 'A Messenger nincs beállítva.' };
  if (!text || !text.trim()) return { sent: 0, failed: 0, total: 0, error: 'Üres üzenet.' };

  const users = await prisma.user.findMany({ where: { messengerPsid: { not: null }, messengerOptIn: true } });

  let sent = 0, failed = 0, total = 0;
  for (const user of users) {
    if (audience !== 'linked') {
      const access = await getActiveAccess(prisma, user.id);
      if (audience === 'active' && !access.active) continue;
      if (['BASIC', 'PREMIUM', 'VIP'].includes(audience) && access.effectiveRank < tierRank(audience)) continue;
    }
    total++;
    const res = await messenger.sendText(user.messengerPsid, text.trim());
    if (res.success) sent++; else { failed++; console.warn(`Broadcast sikertelen (${user.email}): ${res.error}`); }
  }
  return { sent, failed, total };
}

// Biztosítja, hogy a felhasználónak legyen összekötő kódja (ha még nincs PSID-je).
async function ensureLinkCode(user) {
  if (user.messengerPsid || user.messengerLinkCode) return user;
  let code, ok = false, attempts = 0;
  while (!ok && attempts < 8) {
    code = messenger.generateLinkCode();
    const exists = await prisma.user.findUnique({ where: { messengerLinkCode: code } });
    if (!exists) ok = true;
    attempts++;
  }
  return prisma.user.update({ where: { id: user.id }, data: { messengerLinkCode: code } });
}

module.exports = { handleMessengerEvent, linkByCode, notifyNewTip, broadcast, ensureLinkCode, tierLabel };
