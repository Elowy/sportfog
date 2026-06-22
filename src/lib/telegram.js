// Telegram Bot API integráció. Beállítások a beállítás-tárból.
// A felhasználó a t.me/<bot>?start=<kód> linkkel csatlakozik (a Telegram
// automatikusan elküldi a "/start <kód>" üzenetet a botnak), amit a webhook
// dolgoz fel. Ablakkorlát nincs, mint a Messengernél.
const settings = require('../services/settings');

function isEnabled() {
  return Boolean(settings.get('TELEGRAM_BOT_TOKEN'));
}

function apiUrl(method) {
  return `https://api.telegram.org/bot${settings.get('TELEGRAM_BOT_TOKEN')}/${method}`;
}

function botLink(code) {
  const u = settings.get('TELEGRAM_BOT_USERNAME');
  if (!u) return '';
  return code ? `https://t.me/${u}?start=${encodeURIComponent(code)}` : `https://t.me/${u}`;
}

function webhookSecret() {
  return settings.get('TELEGRAM_WEBHOOK_SECRET');
}

async function sendMessage(chatId, text) {
  if (!isEnabled()) return { success: false, error: 'A Telegram nincs beállítva.' };
  try {
    const res = await fetch(apiUrl('sendMessage'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4000), disable_web_page_preview: false }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { success: false, error: data.description || `HTTP ${res.status}` };
    }
    return { success: true, messageId: data.result && data.result.message_id };
  } catch (err) {
    return { success: false, error: `Hálózati hiba: ${err.message}` };
  }
}

module.exports = { isEnabled, botLink, webhookSecret, sendMessage };
