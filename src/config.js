// Alap (bootstrap) konfiguráció a környezeti változókból.
// Az integrációs kulcsok (Stripe, Számlázz, Messenger, Telegram, e-mail, Web Push)
// az admin felületen szerkeszthetők – azokat a services/settings.js kezeli.
require('dotenv').config();

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

  get isProd() {
    return this.env === 'production';
  },
};

module.exports = config;
