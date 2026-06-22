// Web Push (böngésző értesítés) – web-push + VAPID. Beállítások a tárból.
const webpush = require('web-push');
const settings = require('../services/settings');

function publicKey() {
  return settings.get('VAPID_PUBLIC_KEY');
}

function isEnabled() {
  return Boolean(settings.get('VAPID_PUBLIC_KEY') && settings.get('VAPID_PRIVATE_KEY'));
}

function applyVapid() {
  if (!isEnabled()) return false;
  const subject = settings.get('VAPID_SUBJECT') || 'mailto:admin@sportfog.hu';
  webpush.setVapidDetails(subject, settings.get('VAPID_PUBLIC_KEY'), settings.get('VAPID_PRIVATE_KEY'));
  return true;
}

// Új VAPID kulcspár generálása (az admin beállító oldalhoz).
function generateKeys() {
  return webpush.generateVAPIDKeys();
}

// Értesítés küldése egy feliratkozásnak. Ha a feliratkozás megszűnt
// (404/410), gone:true-t adunk vissza, hogy a hívó törölhesse.
async function sendToSub(sub, payloadObj) {
  if (!applyVapid()) return { success: false, error: 'A Web Push nincs beállítva.' };
  const subscription = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payloadObj));
    return { success: true };
  } catch (err) {
    const gone = err.statusCode === 404 || err.statusCode === 410;
    return { success: false, gone, error: err.body || err.message };
  }
}

module.exports = { isEnabled, publicKey, generateKeys, sendToSub };
