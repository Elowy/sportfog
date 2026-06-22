// Stripe integráció – egyszeri fizetésű (one-time) hozzáférési csomagok.
// A csomagokat "payment" módú Checkout Session-ként hozzuk létre, így minden
// vásárlás egyetlen fizetés, amelyhez egy számla készül a Számlázz.hu-n.
const Stripe = require('stripe');
const config = require('../config');
const { TIERS, DURATIONS } = require('./domain');

let stripe = null;
if (config.stripe.enabled) {
  stripe = new Stripe(config.stripe.secretKey);
}

// A nulla tizedesű pénznemek (Stripe a fő egységben várja az összeget).
const ZERO_DECIMAL = new Set([
  'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg',
  'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf',
]);

// Forint (vagy más pénznem) átszámítása a Stripe API által várt összegre.
// HUF esetén az érték a legkisebb egységben (fillér) értendő, és 100-zal
// oszthatónak kell lennie – egész forint értékeknél ez mindig teljesül.
function toStripeAmount(huf, currency) {
  if (ZERO_DECIMAL.has(currency)) return Math.round(huf);
  return Math.round(huf) * 100;
}

function isEnabled() {
  return Boolean(stripe);
}

// Lazán létrehoz / visszaad egy Stripe ügyfelet a felhasználóhoz.
async function ensureCustomer(prisma, user) {
  if (!stripe) return null;
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name || undefined,
    metadata: { userId: user.id },
  });
  await prisma.user.update({
    where: { id: user.id },
    data: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

// Checkout Session létrehozása egy adott (függőben lévő) hozzáféréshez.
async function createCheckoutSession({ user, plan, grant, customerId }) {
  if (!stripe) throw new Error('A Stripe nincs beállítva (hiányzó STRIPE_SECRET_KEY).');

  const currency = config.stripe.currency;
  const tierLabel = TIERS[plan.tier] ? TIERS[plan.tier].label : plan.tier;
  const durLabel = DURATIONS[plan.durationCode] ? DURATIONS[plan.durationCode].label : plan.durationCode;

  const lineItem = plan.stripePriceId
    ? { price: plan.stripePriceId, quantity: 1 }
    : {
        price_data: {
          currency,
          unit_amount: toStripeAmount(plan.priceHuf, currency),
          product_data: {
            name: `Sportfog – ${tierLabel} előfizetés`,
            description: `Hozzáférés a ${tierLabel} szintű tippekhez (${durLabel})`,
          },
        },
        quantity: 1,
      };

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer: customerId || undefined,
    customer_email: customerId ? undefined : user.email,
    line_items: [lineItem],
    locale: 'hu',
    billing_address_collection: 'required',
    customer_update: customerId ? { address: 'auto', name: 'auto' } : undefined,
    client_reference_id: grant.id,
    metadata: {
      grantId: grant.id,
      userId: user.id,
      planId: plan.id,
      tier: plan.tier,
      durationDays: String(plan.durationDays),
    },
    success_url: `${config.baseUrl}/elofizetes/siker?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.baseUrl}/elofizetes/megse`,
  });

  return session;
}

function constructWebhookEvent(rawBody, signature) {
  if (!stripe) throw new Error('A Stripe nincs beállítva.');
  if (!config.stripe.webhookSecret) {
    throw new Error('Hiányzó STRIPE_WEBHOOK_SECRET.');
  }
  return stripe.webhooks.constructEvent(rawBody, signature, config.stripe.webhookSecret);
}

async function retrieveSession(sessionId) {
  if (!stripe) throw new Error('A Stripe nincs beállítva.');
  return stripe.checkout.sessions.retrieve(sessionId);
}

module.exports = {
  stripe,
  isEnabled,
  ensureCustomer,
  createCheckoutSession,
  constructWebhookEvent,
  retrieveSession,
  toStripeAmount,
};
