// Környezeti változók betöltése és központi konfiguráció.
require('dotenv').config();

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'igen', 'on'].includes(String(value).toLowerCase());
}

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  baseUrl: (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  sessionSecret: process.env.SESSION_SECRET || 'fejlesztoi-titok-cserelj-le',

  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@sportfog.hu',
    password: process.env.ADMIN_PASSWORD || 'admin1234',
    name: process.env.ADMIN_NAME || 'Adminisztrátor',
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    currency: (process.env.STRIPE_CURRENCY || 'huf').toLowerCase(),
    get enabled() {
      return Boolean(this.secretKey);
    },
  },

  szamlazz: {
    agentKey: process.env.SZAMLAZZ_AGENT_KEY || '',
    eszamla: bool(process.env.SZAMLAZZ_ESZAMLA, false),
    sendEmail: bool(process.env.SZAMLAZZ_SEND_EMAIL, true),
    prefix: process.env.SZAMLAZZ_PREFIX || '',
    paymentMethod: process.env.SZAMLAZZ_PAYMENT_METHOD || 'bankkártya',
    // ÁFA kulcs: szám (pl. "27", "5", "0") vagy szöveges kulcs (pl. "AM" – alanyi adómentes, "TAM")
    vatRate: process.env.SZAMLAZZ_VAT_RATE || '27',
    get enabled() {
      return Boolean(this.agentKey);
    },
  },

  get isProd() {
    return this.env === 'production';
  },
};

module.exports = config;
