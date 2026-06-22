// Facebook Messenger (Send API) integráció.
// Csak akkor aktív, ha a MESSENGER_PAGE_ACCESS_TOKEN be van állítva.
const crypto = require('crypto');
const config = require('../config');

function isEnabled() {
  return config.messenger.enabled;
}

function graphUrl(path) {
  return `https://graph.facebook.com/${config.messenger.apiVersion}/${path}`;
}

// Egyszerű szöveges üzenet küldése egy PSID-nek.
// messaging_type: 'UPDATE' – a 24 órás ablakon belül működik (a usernek
// nemrég kellett írnia). Ablakon kívül a Meta elutasíthatja.
async function sendText(psid, text) {
  if (!isEnabled()) {
    return { success: false, error: 'A Messenger nincs beállítva.' };
  }
  try {
    const res = await fetch(graphUrl('me/messages') + `?access_token=${encodeURIComponent(config.messenger.pageAccessToken)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_type: 'UPDATE',
        recipient: { id: psid },
        message: { text: text.slice(0, 1900) },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      const msg = data.error ? `${data.error.code}/${data.error.error_subcode || '-'}: ${data.error.message}` : `HTTP ${res.status}`;
      return { success: false, error: msg };
    }
    return { success: true, messageId: data.message_id };
  } catch (err) {
    return { success: false, error: `Hálózati hiba: ${err.message}` };
  }
}

// Webhook GET hitelesítés (Meta a beállításkor hívja meg).
function verifyWebhook(query) {
  const mode = query['hub.mode'];
  const token = query['hub.verify_token'];
  const challenge = query['hub.challenge'];
  if (mode === 'subscribe' && token && token === config.messenger.verifyToken) {
    return { ok: true, challenge };
  }
  return { ok: false };
}

// Webhook POST aláírás-ellenőrzés (X-Hub-Signature-256) az App Secret alapján.
// Ha nincs App Secret beállítva, átengedjük (de naplózzuk).
function verifySignature(rawBody, signatureHeader) {
  if (!config.messenger.appSecret) return true;
  if (!signatureHeader) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', config.messenger.appSecret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch (_) {
    return false;
  }
}

// Egyedi, jól begépelhető összekötő kód (pl. SPORT-7K3Q9X).
function generateLinkCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // kihagyva a könnyen téveszthetők
  let s = '';
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `SPORT-${s}`;
}

module.exports = {
  isEnabled,
  sendText,
  verifyWebhook,
  verifySignature,
  generateLinkCode,
};
