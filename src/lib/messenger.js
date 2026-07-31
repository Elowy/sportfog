// Facebook Messenger (Send API) integráció. Beállítások a beállítás-tárból.
const crypto = require('crypto');
const settings = require('../services/settings');

function isEnabled() {
  return Boolean(settings.get('MESSENGER_PAGE_ACCESS_TOKEN'));
}

function mMeLink() {
  const u = settings.get('MESSENGER_PAGE_USERNAME');
  return u ? `https://m.me/${u}` : '';
}

function graphUrl(path) {
  return `https://graph.facebook.com/${settings.get('MESSENGER_API_VERSION') || 'v21.0'}/${path}`;
}

async function sendText(psid, text) {
  if (!isEnabled()) return { success: false, error: 'A Messenger nincs beállítva.' };
  try {
    const token = settings.get('MESSENGER_PAGE_ACCESS_TOKEN');
    const res = await fetch(graphUrl('me/messages') + `?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_type: 'UPDATE', recipient: { id: psid }, message: { text: text.slice(0, 1900) } }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      const msg = data.error ? `${data.error.code}: ${data.error.message}` : `HTTP ${res.status}`;
      return { success: false, error: msg };
    }
    return { success: true, messageId: data.message_id };
  } catch (err) {
    return { success: false, error: `Hálózati hiba: ${err.message}` };
  }
}

function verifyWebhook(query) {
  const mode = query['hub.mode'];
  const token = query['hub.verify_token'];
  const challenge = query['hub.challenge'];
  if (mode === 'subscribe' && token && token === settings.get('MESSENGER_VERIFY_TOKEN')) {
    return { ok: true, challenge };
  }
  return { ok: false };
}

function verifySignature(rawBody, signatureHeader) {
  const appSecret = settings.get('MESSENGER_APP_SECRET');
  if (!appSecret) return true;
  if (!signatureHeader) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch (_) {
    return false;
  }
}

module.exports = { isEnabled, mMeLink, sendText, verifyWebhook, verifySignature };
