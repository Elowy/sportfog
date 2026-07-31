# Sportfog ⚽

Sportfogadási tippeket kínáló weboldal **előfizetéssel** és **adminisztrátori felülettel**.
Egyelőre focival: a tippek típus szerint (Hazai–Döntetlen–Vendég, gólok, szögletek, lapok stb.)
állíthatók be az admin felületen, és csak az **előfizető** felhasználóknak jelennek meg a részletek.

- **Fizetés:** Stripe (egyszeri fizetésű, időkorlátos hozzáférési csomagok)
- **Számlázás:** Számlázz.hu (Számla Agent) automatikus számlakiállítás sikeres fizetés után
- **Nyelv:** magyar

## Főbb funkciók

- **Egy csomag, változtatható futamidővel**: a felhasználó 1 nap / 1 hét / 1 hónap /
  3 hónap / 6 hónap / 1 év futamidőre fizethet elő. Aktív előfizetéssel minden tipp
  elérhető; a futamidők árai az adminban állíthatók.
- **Böngészési szűrők**: a tippek időablak (1 nap … 1 év) és fogadási típus szerint szűrhetők.
- **Admin felület**: meccsek és tippek kezelése, eredmények rögzítése, árak
  beállítása futamidőnként, felhasználók kezelése (admin jog, kézi hozzáférés adása).
- **Track record**: a lejátszott tippek eredményei nyilvánosan láthatók (találati arány).
- **Részletes statisztika** (Fiókom → Statisztika): havi / liga / csapat / fogadási típus
  szerinti bontás, találati arány és átlag odds; szűrhető korábbi meccsekkel,
  meccsenkénti elemzéssel.

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

## Telepítés cPanel / megosztott tárhelyen

Megosztott tárhelyen a `node` és `npm` nincs az alapértelmezett PATH-ban – egy
**alkalmazás-specifikus Node.js virtuális környezetbe** kerülnek, amelyet a cPanel
**„Setup Node.js App"** eszközével hozol létre. Az alkalmazás kifejezetten ehhez
készült: SQLite-ot használ (nincs külön adatbázis-szerver), és **nincs natív
fordítást igénylő függősége**.

1. **cPanel → Setup Node.js App → Create Application**
   - **Node.js version:** 18 vagy újabb (ha van, 20)
   - **Application mode:** Production
   - **Application root:** a projekt mappája (pl. `fogadas.luiz-tech.hu`)
   - **Application URL:** a domain
   - **Application startup file:** `app.js`
   - Hozd létre az alkalmazást.

2. **SSH-ban aktiváld a Node környezetet.** A „Setup Node.js App" oldal mutat egy
   parancsot (`Enter to the virtual environment`), valami ilyesmit:
   ```bash
   source /home/luiztecs/nodevenv/fogadas.luiz-tech.hu/18/bin/activate && cd /home/luiztecs/fogadas.luiz-tech.hu
   ```
   Ezután a `node` és `npm` elérhető.

3. **Függőségek + adatbázis:**
   ```bash
   npm install
   cp .env.example .env     # töltsd ki (SESSION_SECRET, ADMIN_*, Stripe, Számlázz.hu)
   npm run setup            # séma + seed (admin, csomagok, demó adatok)
   ```
   A `.env` helyett (vagy mellett) a környezeti változókat a „Setup Node.js App"
   felületen is megadhatod (Environment variables), majd **Restart**.

4. **Indítás/újraindítás:** a cPanel (Passenger) automatikusan futtatja az
   `app.js`-t. Módosítás után nyomj **Restart**-ot a felületen (vagy `touch tmp/restart.txt`).
   A `PORT`-ot a Passenger állítja be – az app ehhez automatikusan igazodik.

> **Tipp:** a `.env`-ben a `BASE_URL`-t és `NODE_ENV=production`-t állítsd be a
> valós domainre, hogy a Stripe visszairányítás és a biztonságos süti működjön.

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

## Beállítások az admin felületen

Az integrációs kulcsok (Stripe, Számlázz.hu, Messenger, Telegram, e-mail, Web Push)
a **`.env`** mellett az **Admin → Beállítások** oldalon is szerkeszthetők. Az ott
megadott érték **felülírja a `.env`-et** (az adatbázisban tárolódik). Így nem kell
szerverhez nyúlni egy kulcs cseréjéhez. A bootstrap-jellegű és biztonsági értékek
(`SESSION_SECRET`, `ADMIN_*`, `DATABASE_URL`, `BASE_URL`, `PORT`) maradnak a `.env`-ben.

## Értesítések (e-mail, Telegram, Messenger, Web Push)

A felhasználók **az új tippekről** kapnak értesítést a választott csatornákon
(az **aktív előfizetők**). A csatorna a regisztrációkor
megadható, és a **Fiókom → Értesítések** oldalon bármikor módosítható. Kiváltó:
**új tipp publikálásakor** (az admin tipp-űrlapján bepipálható) és **admin kézi
körüzenettel** (Admin → Üzenetek). Minden csatorna **kikapcsolt marad**, amíg a
kulcsait meg nem adod (a Beállítások oldalon vagy a `.env`-ben).

**E-mail (SMTP):** add meg az `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`,
`SMTP_PASS`, `EMAIL_FROM` értékeket. Az e-mailek tartalmaznak leiratkozó linket.

**Telegram:** a [@BotFather](https://t.me/BotFather)-rel hozz létre egy botot →
`TELEGRAM_BOT_TOKEN`, a bot neve → `TELEGRAM_BOT_USERNAME`. Állíts be egy
webhookot: `setWebhook` a `https://A-TE-DOMENED/webhook/telegram` URL-re (érdemes
`secret_token`-nel, amit a `TELEGRAM_WEBHOOK_SECRET`-be is beírsz). A felhasználó a
Fiókomban a **Megnyitás Telegramban** gombbal egy kattintással összekapcsolja a fiókját.

**Facebook Messenger:** Facebook oldal + Meta app + Messenger termék kell.
`MESSENGER_PAGE_ACCESS_TOKEN`, `MESSENGER_APP_SECRET`, `MESSENGER_VERIFY_TOKEN`,
`MESSENGER_PAGE_USERNAME`. Webhook: `https://A-TE-DOMENED/webhook/messenger`
(ugyanaz a Verify Token; `messages`, `messaging_postbacks`, `messaging_referrals`
mezők). A felhasználó a Fiókomban kapott kódot küldi el a botnak. **Korlát:** a Meta
24 órás szabálya és a szerencsejáték-tartalom korlátozásai vonatkoznak rá.

**Web Push (böngésző értesítés):** generálj VAPID kulcspárt az **Admin → Beállítások**
oldalon egy gombbal (vagy `npx web-push generate-vapid-keys`), állítsd be a
`VAPID_SUBJECT`-et. A felhasználó a Fiókomban a **Bekapcsolás ezen az eszközön**
gombbal engedélyezi (böngészőnként/eszközönként). HTTPS szükséges.

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
    domain.js        # futamidők, fogadási típusok (magyar címkék)
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
