// Sportfog – alkalmazás belépési pont.
const path = require('path');
const express = require('express');
const session = require('express-session');
const { PrismaSessionStore } = require('@quixo3/prisma-session-store');
const helmet = require('helmet');
const morgan = require('morgan');
const expressLayouts = require('express-ejs-layouts');

const config = require('./config');
const prisma = require('./db');
const domain = require('./lib/domain');
const stripeLib = require('./lib/stripe');
const szamlazz = require('./lib/szamlazz');
const settings = require('./services/settings');
const { flash, csrf } = require('./middleware/web');
const { loadUser } = require('./middleware/auth');

const app = express();

// Proxy mögött (pl. Nginx) a secure cookie-khoz
if (config.isProd) app.set('trust proxy', 1);

// Biztonsági fejlécek – a Tailwind CDN és a betűtípusok engedélyezésével.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://cdn.tailwindcss.com', 'https://js.stripe.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'https://api.stripe.com'],
        frameSrc: ['https://js.stripe.com', 'https://hooks.stripe.com'],
      },
    },
  })
);

if (!config.isProd) app.use(morgan('dev'));

// Nézetmotor
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(expressLayouts);
app.set('layout', 'layout');

// Statikus fájlok
app.use(express.static(path.join(__dirname, '..', 'public')));

// Globális, kérésfüggetlen lokálisok a nézetekhez
app.locals.siteName = 'Sportfog';
app.locals.domain = domain;
app.locals.formatHuf = domain.formatHuf;
app.locals.formatDateTime = domain.formatDateTime;
app.locals.formatDate = domain.formatDate;
app.locals.baseUrl = config.baseUrl;

// Session – a meglévő (Prisma/SQLite) adatbázisban tároljuk, így nincs
// natív fordítást igénylő függőség (jól működik cPanel/megosztott tárhelyen).
app.use(
  session({
    store: new PrismaSessionStore(prisma, {
      checkPeriod: 1000 * 60 * 60, // lejárt session-ök takarítása óránként
      dbRecordIdIsSessionId: true,
    }),
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProd,
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30 nap
    },
  })
);

// FONTOS: a Stripe webhook a nyers törzset igényli, ezért a body-parserek
// ÉS a CSRF ELŐTT mountoljuk.
app.use('/webhook', require('./routes/webhook'));

// Body parserek
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Alap lokálisok – még a CSRF előtt beállítjuk, hogy a hibaoldal (amit a CSRF
// is renderelhet) minden szükséges változót megtaláljon.
app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  res.locals.title = null;
  res.locals.currentUser = null;
  res.locals.access = { active: false, expiresAt: null };
  // Alapértelmezett CSRF token, hogy a hibaoldal akkor is renderelhető legyen,
  // ha a hiba a CSRF-middleware lefutása előtt keletkezik (a valódi CSRF
  // middleware később felülírja a tényleges tokennel).
  res.locals.csrfToken = '';
  // Az integrációk állapota dinamikus (az admin beállításoktól függ).
  res.locals.stripeEnabled = stripeLib.isEnabled();
  res.locals.szamlazzEnabled = szamlazz.isEnabled();
  next();
});

// Flash + felhasználó betöltés + CSRF
app.use(flash);
app.use(loadUser);
app.use(csrf);

// Útvonalak
app.use('/', require('./routes/index'));
app.use('/', require('./routes/auth'));
app.use('/tippek', require('./routes/tips'));
app.use('/elofizetes', require('./routes/subscribe'));
app.use('/fiok', require('./routes/account'));
app.use('/statisztika', require('./routes/stats'));
app.use('/admin', require('./routes/admin'));

// 404
app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Az oldal nem található',
    message: 'A keresett oldal nem létezik.',
  });
});

// Hibakezelő
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).render('error', {
    title: 'Hiba történt',
    message: config.isProd ? 'Váratlan hiba történt. Kérjük, próbáld újra később.' : err.message,
  });
});

// Passenger (cPanel) a PORT környezeti változóban adhat meg portot vagy
// Unix socket elérési utat is – ezért a nyers értéket adjuk át a listen-nek.
const listenTarget = process.env.PORT || config.port;

// Az admin beállításokat indulás előtt betöltjük a DB-ből (a .env fölé).
const server = app.listen(listenTarget, async () => {
  await settings.reload();
  console.log(`Sportfog fut: ${config.baseUrl} (${listenTarget})`);
  if (!stripeLib.isEnabled()) {
    console.warn('Figyelem: a Stripe nincs beállítva – a fizetés nem működik.');
  }
});

module.exports = { app, server };
