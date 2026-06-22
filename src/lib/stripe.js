// Stripe integráció – egyszeri fizetésű hozzáférési csomagok.
// A kulcsokat a beállítás-tárból olvassa (DB felülírja a .env-et), ezért
// a klienst lazán, az aktuális kulcs alapján hozzuk létre.
const Stripe = require('stripe');
const config = require('../config');
const settings = require('../services/settings');
const { TIERS, DURATIONS } = require('./domain');

let cached = null;
let cachedKey = null;

function getStripe() {
  const key = settings.get('STRIPE_SECRET_KEY');
  if (!key) return null;
  if (key !== cachedKey) {
    cached = new Stripe(key);
    cachedKey = key;
  }
  return cached;
}

function isEnabled() {
  return Boolean(settings.get('STRIPE_SECRET_KEY'));
}

function currency() {
  return (settings.get('STRIPE_CURRENCY') || 'huf').toLowerCase();
}

const ZERO_DECIMAL = new Set([
  'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg',
  'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf',
]);

function toStripeAmount(huf, cur) {
  if (ZERO_DECIMAL.has(cur)) return Math.round(huf);
  return Math.round(huf) * 100;
}

async function ensureCustomer(prisma, user) {
  const stripe = getStripe();
  if (!stripe) return null;
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name || undefined,
    metadata: { userId: user.id },
  });
  await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}

async function createCheckoutSession({ user, plan, grant, customerId }) {
  const stripe = getStripe();
  if (!stripe) throw new Error('A Stripe nincs beállítva.');

  const cur = currency();
  const tierLabel = TIERS[plan.tier] ? TIERS[plan.tier].label : plan.tier;
  const durLabel = DURATIONS[plan.durationCode] ? DURATIONS[plan.durationCode].label : plan.durationCode;

  const lineItem = plan.stripePriceId
    ? { price: plan.stripePriceId, quantity: 1 }
    : {
        price_data: {
          currency: cur,
          unit_amount: toStripeAmount(plan.priceHuf, cur),
          product_data: {
            name: `Sportfog – ${tierLabel} előfizetés`,
            description: `Hozzáférés a ${tierLabel} szintű tippekhez (${durLabel})`,
          },
        },
        quantity: 1,
      };

  return stripe.checkout.sessions.create({
    mode: 'payment',
    customer: customerId || undefined,
    customer_email: customerId ? undefined : user.email,
    line_items: [lineItem],
    locale: 'hu',
    billing_address_collection: 'required',
    customer_update: customerId ? { address: 'auto', name: 'auto' } : undefined,
    client_reference_id: grant.id,
    metadata: { grantId: grant.id, userId: user.id, planId: plan.id, tier: plan.tier, durationDays: String(plan.durationDays) },
    success_url: `${config.baseUrl}/elofizetes/siker?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.baseUrl}/elofizetes/megse`,
  });
}

function constructWebhookEvent(rawBody, signature) {
  const stripe = getStripe();
  if (!stripe) throw new Error('A Stripe nincs beállítva.');
  const secret = settings.get('STRIPE_WEBHOOK_SECRET');
  if (!secret) throw new Error('Hiányzó STRIPE_WEBHOOK_SECRET.');
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}

async function retrieveSession(sessionId) {
  const stripe = getStripe();
  if (!stripe) throw new Error('A Stripe nincs beállítva.');
  return stripe.checkout.sessions.retrieve(sessionId);
}

module.exports = { isEnabled, ensureCustomer, createCheckoutSession, constructWebhookEvent, retrieveSession, toStripeAmount };
