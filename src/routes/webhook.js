// Stripe webhook – a nyers törzset igényli, ezért a body-parserek előtt
// mountoljuk (lásd server.js). Itt express.raw-ot használunk útvonal szinten.
const express = require('express');
const router = express.Router();
const stripeLib = require('../lib/stripe');
const messenger = require('../lib/messenger');
const telegram = require('../lib/telegram');
const { fulfillFromSession } = require('../services/fulfillment');
const { handleMessengerEvent, handleTelegramUpdate } = require('../services/notifications');

router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripeLib.isEnabled()) {
    return res.status(503).send('A Stripe nincs beállítva.');
  }

  const signature = req.get('stripe-signature');
  let event;
  try {
    event = stripeLib.constructWebhookEvent(req.body, signature);
  } catch (err) {
    console.error('Stripe webhook aláírás-hiba:', err.message);
    return res.status(400).send(`Webhook hiba: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object;
        const result = await fulfillFromSession(session);
        if (!result.ok) {
          console.warn('Webhook feldolgozás:', result.reason);
        }
        break;
      }
      default:
        // Egyéb eseményeket figyelmen kívül hagyunk.
        break;
    }
  } catch (err) {
    console.error('Hiba a webhook feldolgozásakor:', err);
    // 200-at adunk vissza, hogy a Stripe ne próbálkozzon végtelenül, ha a hiba a mi oldalunkon van;
    // a hibát naplózzuk. (Aláírás-hiba esetén fentebb 400-at adtunk.)
  }

  res.json({ received: true });
});

// --- Facebook Messenger webhook ------------------------------------------

// GET: a Meta a webhook beállításakor ezzel hitelesít.
router.get('/messenger', (req, res) => {
  const result = messenger.verifyWebhook(req.query);
  if (result.ok) return res.status(200).send(result.challenge);
  return res.sendStatus(403);
});

// POST: bejövő üzenetek / események. Nyers törzs kell az aláírás-ellenőrzéshez.
router.post('/messenger', express.raw({ type: '*/*' }), async (req, res) => {
  const signature = req.get('x-hub-signature-256');
  if (!messenger.verifySignature(req.body, signature)) {
    console.warn('Messenger webhook: érvénytelen aláírás.');
    return res.sendStatus(403);
  }

  let body;
  try {
    body = JSON.parse(req.body.toString('utf8'));
  } catch (_) {
    return res.sendStatus(400);
  }

  // Azonnal nyugtázzuk (a Meta gyors választ vár), a feldolgozás utána fut.
  res.status(200).send('EVENT_RECEIVED');

  if (body.object !== 'page') return;
  try {
    for (const entry of body.entry || []) {
      for (const event of entry.messaging || []) {
        await handleMessengerEvent(event);
      }
    }
  } catch (err) {
    console.error('Messenger esemény feldolgozási hiba:', err);
  }
});

// --- Telegram webhook ----------------------------------------------------
router.post('/telegram', express.json(), async (req, res) => {
  const secret = telegram.webhookSecret();
  if (secret && req.get('x-telegram-bot-api-secret-token') !== secret) {
    return res.sendStatus(403);
  }
  res.sendStatus(200);
  try {
    await handleTelegramUpdate(req.body);
  } catch (err) {
    console.error('Telegram update feldolgozási hiba:', err);
  }
});

module.exports = router;
