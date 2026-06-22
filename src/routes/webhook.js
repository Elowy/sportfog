// Stripe webhook – a nyers törzset igényli, ezért a body-parserek előtt
// mountoljuk (lásd server.js). Itt express.raw-ot használunk útvonal szinten.
const express = require('express');
const router = express.Router();
const stripeLib = require('../lib/stripe');
const { fulfillFromSession } = require('../services/fulfillment');

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

module.exports = router;
