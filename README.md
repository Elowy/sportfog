# Sportfog ⚽

Sportfogadási tippeket kínáló weboldal **előfizetéssel** és **adminisztrátori felülettel**.
Egyelőre focival: a tippek típus szerint (Hazai–Döntetlen–Vendég, gólok, szögletek, lapok stb.)
állíthatók be az admin felületen, és csak az **előfizető** felhasználóknak jelennek meg a részletek.

- **Fizetés:** Stripe (egyszeri fizetésű, időkorlátos hozzáférési csomagok)
- **Számlázás:** Számlázz.hu (Számla Agent) automatikus számlakiállítás sikeres fizetés után
- **Nyelv:** magyar

## Főbb funkciók

- **Időtávok**: a felhasználó 1 nap / 3 nap / 1 hét / 1 hónap / 3 hónap / 6 hónap / 1 év
  időtávra fizethet elő, és a tippeket időablak szerint is szűrheti.
- **Előfizetési szintek (tier)**: Alap / Prémium / VIP. A magasabb szint a kisebb
  szintek tippjeit is feloldja. Minden tipphez beállítható, melyik szinttől látható.
- **Admin felület**: meccsek és tippek kezelése, eredmények rögzítése, csomagárak
  beállítása, felhasználók kezelése (admin jog, kézi hozzáférés adása).
- **Track record**: a lejátszott tippek eredményei nyilvánosan láthatók (találati arány).

## Technológia

- Node.js + Express (szerveroldali renderelés, EJS sablonok) – egyetlen folyamat,
  build-lépés nélkül fut bármilyen webszerveren / VPS-en.
- Prisma ORM + **SQLite** (alapértelmezetten, külön adatbázis-szerver nélkül).
  PostgreSQL-re egyszerűen átállítható (lásd lentebb).
- Tailwind CSS (CDN-ről, nincs build).
- Session alapú bejelentkezés (bcrypt jelszó-hash), CSRF-védelem, Helmet biztonsági fejlécek.

## Telepítés

Szükséges: **Node.js 18+**.

```bash
# 1. Függőségek telepítése
npm install

# 2. Környezeti változók
cp .env.example .env
#   majd töltsd ki a .env fájlt (legalább a SESSION_SECRET és az ADMIN_* értékeket)

# 3. Adatbázis séma + kezdeti adatok (admin, csomagok, demó meccsek)
npm run setup

# 4. Indítás
npm start
#   fejlesztéshez automatikus újratöltéssel:
npm run dev
```

Az oldal alapértelmezetten a http://localhost:3000 címen érhető el.

Bejelentkezés adminként a `.env`-ben megadott `ADMIN_EMAIL` / `ADMIN_PASSWORD` értékekkel.
Az admin felület: **/admin**.

## Stripe beállítása

1. Hozz létre egy Stripe fiókot, és a **Developers → API keys** alól másold be a
   `STRIPE_SECRET_KEY` és `STRIPE_PUBLISHABLE_KEY` értékeket a `.env`-be.
2. **Webhook**: a **Developers → Webhooks** alatt vegyél fel egy végpontot:
   `https://A-TE-DOMENED/webhook/stripe`, és figyeld legalább a
   `checkout.session.completed` eseményt. A kapott aláírási titkot (`whsec_...`)
   tedd a `STRIPE_WEBHOOK_SECRET` változóba.
3. Helyi teszteléshez a Stripe CLI ajánlott:
   ```bash
   stripe listen --forward-to localhost:3000/webhook/stripe
   ```
4. A pénznem alapból `huf`. A csomagárakat az admin **Csomagok & árak** oldalán
   állíthatod; opcionálisan megadhatsz előre létrehozott Stripe Price azonosítót is.

> A fizetés Stripe **Checkout** átirányítással történik (egyszeri fizetés), így a
> kártyaadatok sosem érintik a szervert. Minden vásárlás időkorlátos hozzáférést ad,
> amely a megvásárolt időtartam végén lejár.

## Számlázz.hu beállítása

1. A Számlázz.hu fiók irányítópultján (lent) generálj egy **Számla Agent kulcsot**.
2. Tedd a kulcsot a `.env` `SZAMLAZZ_AGENT_KEY` változójába.
3. További opciók: `SZAMLAZZ_ESZAMLA`, `SZAMLAZZ_SEND_EMAIL`, `SZAMLAZZ_PREFIX`,
   `SZAMLAZZ_PAYMENT_METHOD`, `SZAMLAZZ_VAT_RATE` (a megadott ár **bruttó**).

Sikeres fizetés után a rendszer automatikusan számlát állít ki a vásárló
Stripe-nál megadott számlázási adataival. A számlaszám megjelenik a felhasználó
**Fiókom** oldalán és az admin irányítópulton. Ha a kulcs nincs megadva, a
fizetés és a hozzáférés ettől még működik, csak számla nem készül.

## PostgreSQL-re váltás (opcionális)

1. A `prisma/schema.prisma` fájlban a `datasource db` blokk `provider` mezőjét
   állítsd `postgresql`-re.
2. A `.env`-ben a `DATABASE_URL`-t add meg, pl.:
   `postgresql://felhasznalo:jelszo@localhost:5432/sportfog`
3. Futtasd: `npm run setup`.

## Projekt felépítése

```
prisma/
  schema.prisma      # adatmodell (User, Match, Tip, Plan, AccessGrant)
  seed.js            # admin, csomagok, demó adatok
src/
  server.js          # alkalmazás belépési pont, middleware-ek
  config.js          # környezeti változók
  db.js              # Prisma kliens
  lib/
    domain.js        # szintek, időtartamok, fogadási típusok (magyar címkék)
    stripe.js        # Stripe Checkout + ügyfél
    szamlazz.js      # Számlázz.hu (Számla Agent) XML kliens
    access.js        # aktív hozzáférés kiszámítása
  services/
    fulfillment.js   # fizetés feldolgozása + számlázás
  middleware/        # auth, flash, CSRF
  routes/            # nyilvános + admin útvonalak
  views/             # EJS sablonok
public/              # statikus fájlok (CSS)
```

## Felelős játék

A szerencsejáték függőséget okozhat. A szolgáltatás kizárólag 18 éven felülieknek szól.
A tippek tájékoztató jellegűek, nem garantálnak nyereményt.
