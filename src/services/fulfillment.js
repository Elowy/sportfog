// Sikeres fizetés feldolgozása: a függőben lévő hozzáférés aktiválása,
// majd számla kiállítása a Számlázz.hu-n. Idempotens – ha a hozzáférés már
// kifizetett állapotú, nem dolgozza fel újra.
const prisma = require('../db');
const szamlazz = require('../lib/szamlazz');
const { TIERS, DURATIONS } = require('../lib/domain');

// A Stripe Checkout Session-ből aktiválja a kapcsolódó AccessGrant-et.
async function fulfillFromSession(session) {
  const grantId = (session.metadata && session.metadata.grantId) || session.client_reference_id;
  if (!grantId) {
    return { ok: false, reason: 'Hiányzó grantId a session metaadatban.' };
  }

  const grant = await prisma.accessGrant.findUnique({ where: { id: grantId }, include: { user: true, plan: true } });
  if (!grant) {
    return { ok: false, reason: `Nincs ilyen hozzáférés: ${grantId}` };
  }
  if (grant.status === 'PAID') {
    return { ok: true, alreadyPaid: true, grant };
  }

  const paid = session.payment_status === 'paid' || session.status === 'complete';
  if (!paid) {
    return { ok: false, reason: `A fizetés még nem teljesült (${session.payment_status}).` };
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + grant.durationDays * 24 * 60 * 60 * 1000);
  const amountHuf = session.amount_total != null ? stripeAmountToHuf(session.amount_total, session.currency) : grant.amountHuf;

  const updated = await prisma.accessGrant.update({
    where: { id: grant.id },
    data: {
      status: 'PAID',
      startsAt: now,
      expiresAt,
      amountHuf: amountHuf ?? grant.amountHuf,
      stripePaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : grant.stripePaymentIntentId,
    },
    include: { user: true, plan: true },
  });

  // Számla kiállítása (nem blokkoló jellegű – hibát eltároljuk, de a hozzáférés él).
  await issueInvoiceForGrant(updated, session);

  return { ok: true, grant: updated };
}

// A Stripe összeget (a pénznem legkisebb egysége) visszaszámolja forintra.
// HUF, EUR, USD esetén ez osztás 100-zal; a nulla tizedesű pénznemeket itt
// most nem kezeljük külön, mert az oldal forintban árazik.
function stripeAmountToHuf(amount /*, currency */) {
  return Math.round(amount / 100);
}

async function issueInvoiceForGrant(grant, session) {
  if (!szamlazz.isEnabled()) return;
  if (grant.invoiceNumber) return; // már van számla

  const details = session.customer_details || {};
  const addr = details.address || {};
  const tierLabel = TIERS[grant.tier] ? TIERS[grant.tier].label : grant.tier;
  const durLabel = grant.plan && DURATIONS[grant.plan.durationCode]
    ? DURATIONS[grant.plan.durationCode].label
    : `${grant.durationDays} nap`;

  const buyer = {
    name: details.name || grant.user.name || grant.user.email,
    email: details.email || grant.user.email,
    zip: addr.postal_code || '',
    city: addr.city || '',
    address: [addr.line1, addr.line2].filter(Boolean).join(', '),
  };

  const item = {
    name: `Sportfog ${tierLabel} előfizetés (${durLabel})`,
    quantity: 1,
    grossUnitPrice: grant.amountHuf || (grant.plan ? grant.plan.priceHuf : 0),
  };

  try {
    const result = await szamlazz.issueInvoice({
      buyer,
      item,
      orderNumber: grant.id,
      comment: `Sportfog hozzáférés – ${tierLabel} (${durLabel})`,
    });
    if (result.success) {
      await prisma.accessGrant.update({
        where: { id: grant.id },
        data: { invoiceNumber: result.invoiceNumber, invoiceError: null },
      });
    } else {
      await prisma.accessGrant.update({
        where: { id: grant.id },
        data: { invoiceError: result.error },
      });
    }
  } catch (err) {
    await prisma.accessGrant.update({
      where: { id: grant.id },
      data: { invoiceError: `Számlázási kivétel: ${err.message}` },
    });
  }
}

module.exports = { fulfillFromSession, issueInvoiceForGrant };
