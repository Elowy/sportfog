// Admin felületen szerkeszthető beállítások. A DB-ben tárolt érték felülírja
// a .env-et; ha nincs DB-érték, a process.env (vagy a default) érvényes.
// A modul memóriában gyorsítótáraz; mentés és induláskor frissül.
const prisma = require('../db');

// Mezőtípusok: text | password | bool. group: az admin oldali csoportosításhoz.
const DEFS = [
  // Stripe
  { key: 'STRIPE_SECRET_KEY', group: 'Stripe', label: 'Titkos kulcs (sk_...)', type: 'password' },
  { key: 'STRIPE_PUBLISHABLE_KEY', group: 'Stripe', label: 'Publikus kulcs (pk_...)', type: 'text' },
  { key: 'STRIPE_WEBHOOK_SECRET', group: 'Stripe', label: 'Webhook titok (whsec_...)', type: 'password' },
  { key: 'STRIPE_CURRENCY', group: 'Stripe', label: 'Pénznem', type: 'text', default: 'huf' },
  // Számlázz.hu
  { key: 'SZAMLAZZ_AGENT_KEY', group: 'Számlázz.hu', label: 'Agent kulcs', type: 'password' },
  { key: 'SZAMLAZZ_ESZAMLA', group: 'Számlázz.hu', label: 'E-számla', type: 'bool', default: 'false' },
  { key: 'SZAMLAZZ_SEND_EMAIL', group: 'Számlázz.hu', label: 'Számla e-mailt küldjön', type: 'bool', default: 'true' },
  { key: 'SZAMLAZZ_PREFIX', group: 'Számlázz.hu', label: 'Számlaszám előtag', type: 'text' },
  { key: 'SZAMLAZZ_PAYMENT_METHOD', group: 'Számlázz.hu', label: 'Fizetési mód felirat', type: 'text', default: 'bankkártya' },
  { key: 'SZAMLAZZ_VAT_RATE', group: 'Számlázz.hu', label: 'ÁFA kulcs (pl. 27, AM)', type: 'text', default: '27' },
  // Messenger
  { key: 'MESSENGER_PAGE_ACCESS_TOKEN', group: 'Messenger', label: 'Page Access Token', type: 'password' },
  { key: 'MESSENGER_VERIFY_TOKEN', group: 'Messenger', label: 'Verify Token', type: 'text' },
  { key: 'MESSENGER_APP_SECRET', group: 'Messenger', label: 'App Secret', type: 'password' },
  { key: 'MESSENGER_PAGE_USERNAME', group: 'Messenger', label: 'Oldal felhasználónév (m.me)', type: 'text' },
  { key: 'MESSENGER_API_VERSION', group: 'Messenger', label: 'Graph API verzió', type: 'text', default: 'v21.0' },
  // Telegram
  { key: 'TELEGRAM_BOT_TOKEN', group: 'Telegram', label: 'Bot Token', type: 'password' },
  { key: 'TELEGRAM_BOT_USERNAME', group: 'Telegram', label: 'Bot felhasználónév (t.me, @ nélkül)', type: 'text' },
  { key: 'TELEGRAM_WEBHOOK_SECRET', group: 'Telegram', label: 'Webhook titok (secret_token)', type: 'password' },
  // E-mail (SMTP)
  { key: 'SMTP_HOST', group: 'E-mail', label: 'SMTP host', type: 'text' },
  { key: 'SMTP_PORT', group: 'E-mail', label: 'SMTP port', type: 'text', default: '587' },
  { key: 'SMTP_SECURE', group: 'E-mail', label: 'SSL/TLS (465-höz true)', type: 'bool', default: 'false' },
  { key: 'SMTP_USER', group: 'E-mail', label: 'SMTP felhasználó', type: 'text' },
  { key: 'SMTP_PASS', group: 'E-mail', label: 'SMTP jelszó', type: 'password' },
  { key: 'EMAIL_FROM', group: 'E-mail', label: 'Feladó (pl. Sportfog <no-reply@...>)', type: 'text' },
  // Web Push (VAPID)
  { key: 'VAPID_PUBLIC_KEY', group: 'Web Push', label: 'VAPID publikus kulcs', type: 'text' },
  { key: 'VAPID_PRIVATE_KEY', group: 'Web Push', label: 'VAPID privát kulcs', type: 'password' },
  { key: 'VAPID_SUBJECT', group: 'Web Push', label: 'VAPID subject (mailto:... vagy URL)', type: 'text' },
];

const DEF_BY_KEY = {};
DEFS.forEach((d) => { DEF_BY_KEY[d.key] = d; });

let cache = {};

async function reload() {
  try {
    const rows = await prisma.setting.findMany();
    const next = {};
    rows.forEach((r) => { next[r.key] = r.value; });
    cache = next;
  } catch (err) {
    console.error('Beállítások betöltése sikertelen:', err.message);
  }
}

function get(key) {
  if (cache[key] !== undefined && cache[key] !== null && cache[key] !== '') return cache[key];
  if (process.env[key] !== undefined && process.env[key] !== '') return process.env[key];
  const d = DEF_BY_KEY[key];
  return d && d.default !== undefined ? d.default : '';
}

function getBool(key) {
  return ['1', 'true', 'yes', 'igen', 'on'].includes(String(get(key)).toLowerCase());
}

function isSet(key) {
  return Boolean(get(key));
}

async function setMany(values) {
  for (const [key, value] of Object.entries(values)) {
    if (!DEF_BY_KEY[key]) continue;
    await prisma.setting.upsert({
      where: { key },
      update: { value: String(value) },
      create: { key, value: String(value) },
    });
  }
  await reload();
}

// Az admin űrlaphoz: csoportosított mezők az aktuális (DB vagy env) értékkel,
// jelezve, hogy az érték honnan jön (db/env/default) és hogy a .env adja-e.
function groupedForAdmin() {
  const groups = {};
  for (const d of DEFS) {
    if (!groups[d.group]) groups[d.group] = [];
    const fromDb = cache[d.key] !== undefined && cache[d.key] !== '';
    const fromEnv = !fromDb && process.env[d.key] !== undefined && process.env[d.key] !== '';
    groups[d.group].push({
      ...d,
      fromDb,
      fromEnv,
      isSet: Boolean(get(d.key)),
      // Jelszó mezőnél sosem írjuk ki az értéket; szövegnél a tényleges érték látszik.
      effective: d.type === 'password' ? '' : get(d.key),
      checked: d.type === 'bool' ? getBool(d.key) : false,
    });
  }
  return groups;
}

module.exports = { DEFS, reload, get, getBool, isSet, setMany, groupedForAdmin };
