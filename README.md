# OMSI Depo

Download portál pre modifikácie OMSI 2 zameraný na českú a slovenskú komunitu. Mapy, autobusy, trolejbusy,
repainty, HOF súbory, objekty a nástroje sa sťahujú **bez registrácie, bez reklám a bez odpočítavania**. Účet je
potrebný iba na nahrávanie, recenzie, hlásenia chýb, nahlasovanie a sledovanie pripravovaných vydaní.

**Stack:** Next.js 16 (App Router, TypeScript strict) · PostgreSQL 16 (`unaccent`, `pg_trgm`) · Prisma 7 ·
Redis 7 · Better Auth (Argon2id, Discord OAuth2) · sharp · yauzl + oficiálny 7-Zip · Tailwind CSS 4 · Vitest.

---

## Rýchly štart (Docker)

```bash
cp .env.example .env
docker compose up --build
```

1. Do `.env` doplň tri tajomstvá (`AUTH_SECRET`, `DOWNLOAD_TOKEN_SECRET`, `IP_HASH_SECRET`), napríklad cez `openssl rand -base64 48`.
2. Služba `migrate` spustí `prisma migrate deploy` a potom idempotentný seed. Pri `SEED_DEMO_DATA=true` vytvorí
   ukážkové účty a mody so **skutočnými** archívmi, ktoré sa dajú hneď stiahnuť.
3. Otvor:

| Služba | Adresa |
| --- | --- |
| Web | http://localhost:3000 |
| Administrácia | http://localhost:3000/admin |
| Stav služby | http://localhost:3000/api/health |
| Mailpit (zachytené emaily) | http://localhost:8025 |

### Testovacie účty (seed)

| Rola | Email | Heslo |
| --- | --- | --- |
| Administrátor | `admin@omsi-depo.local` | `Depo-Spravca-2026` |
| Moderátor | `moderator@omsi-depo.local` | `Depo-Dispecer-2026` |
| Overený autor | `autor@omsi-depo.local` | `Depo-Mapar-2026` |
| Používateľ | `vodic@omsi-depo.local` | `Depo-Vodic-2026` |

> Tieto účty slúžia iba na vyskúšanie. V produkcii nastav `SEED_DEMO_DATA=false` (seed vtedy doplní iba
> číselníky), alebo ukážkové účty po nasadení zmaž či im zmeň heslá.

### Čo seed vytvorí

- Číselníky: 8 kategórií s podkategóriami, značky vozidiel (Karosa, SOR, Irisbus/Iveco, Škoda, Tatra…),
  dopravcov (DPB, DPP, DPMB, DPMK, DPmŽ, SAD, ČSAD, Arriva, RegioJet…) a platené Steam DLC.
- **Pezinok – Modra – Harmónia:** mapa s hlavným archívom, `.hof`, PDF manuálom, opravným patchom 1.0.2,
  mirrorom, závislosťou a 4GB Patchom.
- Ďalšie mody: repainty Karosa/SOR (DPB, DPMK), československé označníky, skripty kasy EMTEST so zvukmi
  a `.dll` pluginom, ktorý čaká na manuálnu kontrolu.
- Nový mod od bežného používateľa, ktorý čaká v schvaľovacej fronte, a jedno otvorené nahlásenie.
- Pripravované vydania vo všetkých troch režimoch: presný dátum o 4 dni s automatickým odomknutím, obdobie
  „Zima“ a TBA. Majú stav vývoja a devlogy s fotkami.
- Recenzie, vyriešené hlásenie chyby s `logfile.txt`, štatistiky stiahnutí pre rebríčky a sledujúcich.

Každý súbor prejde rovnakou kontrolou ako upload (magic bytes, obsah archívu, SHA-256) a uloží sa do úložiska.

---

## Nasadenie na Linux server

Potrebuješ Docker Engine s Compose v2 (Debian/Ubuntu: `curl -fsSL https://get.docker.com | sh`), `git`,
`openssl` a `curl`. Funguje na x86_64 aj ARM64 (napr. Raspberry Pi 5).

```bash
git clone https://github.com/FilipCaklos/omsi-web.git
cd omsi-web
./scripts/setup.sh
```

Skript pri prvom spustení:

1. vytvorí `.env` z `.env.example` s náhodným heslom databázy a tromi náhodnými tajomstvami (`chmod 600`),
2. opýta sa na adresu portálu (predvolene `http://<IP v LAN>:3000`),
3. spustí `docker compose up -d --build` a počká, kým `/api/health` odpovie.

Prepínač `--bez-ukazok` vypne ukážkové účty a mody. Existujúci `.env` skript nikdy neprepíše.

**Aktualizácia na novú verziu:**

```bash
git pull
docker compose up -d --build
```

Na porte 3000 počúva brána `gateway` (Caddy, [deploy/Caddyfile](deploy/Caddyfile)), samotná aplikácia nie je
zverejnená. Brána určí skutočnú IP návštevníka a podvrhnutú hlavičku `X-Forwarded-For` od klienta ignoruje –
inak by sa dali obísť limity na prihlásenie, registráciu a sťahovanie.

Migrácie databázy sa spustia automaticky (služba `migrate`). Dáta sú v Docker volumes `pgdata`, `redisdata`
a `modstorage`. Záloha databázy: `docker compose exec postgres pg_dump -U omsi omsi_depo > zaloha.sql`.

**Verejná doména s HTTPS:** daj pred aplikáciu reverznú proxy (Caddy, nginx, Traefik), ktorá presmeruje na
port 3000, a v `.env` nastav `APP_URL=https://tvoja-domena.sk`. HSTS a `upgrade-insecure-requests` sa zapnú
automaticky iba pri `https://` adrese. Potom nastav aj:

- vlastné `TURNSTILE_SITE_KEY` a `TURNSTILE_SECRET_KEY` (testovacie kľúče fungujú iba na localhoste a v LAN),
- skutočný SMTP server (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE`, `MAIL_FROM`) –
  v predvolenom stave sa všetky emaily zachytávajú v Mailpite na `http://127.0.0.1:8025`. Hodnoty SMTP
  v sekcii `x-app-env` v `docker-compose.yml` majú prednosť pred `.env`, takže ich treba zmeniť tam,
- `TRUSTED_PROXIES=private_ranges` – brána potom uverí IP, ktorú pošle tvoja proxy. Bez tohto nastavenia by
  všetci návštevníci mali IP tvojej proxy a zdieľali by jeden limit.

Po každej zmene `.env` stačí `docker compose up -d`.

---

## Lokálny vývoj

```bash
docker compose up -d postgres redis mailpit
npm install
npx prisma migrate deploy
npm run db:seed
npm run dev
```

| Skript | Účel |
| --- | --- |
| `npm run dev` / `build` / `start` | vývojový server / produkčný build (standalone) / štart buildu |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | všetky testy (unit + integračné) |
| `npm run test:integration` | iba kritické toky (upload, sťahovanie, Range, moderácia, naplánované vydanie) |
| `npm run db:seed` / `db:reset` | seed / vymazanie DB a znovu migrácie |

**Testy** nepotrebujú Docker. Integračné testy spúšťajú skutočný PostgreSQL v procese (PGlite so všetkými
migráciami vrátane `unaccent` a `pg_trgm`), Redis nahrádza `ioredis-mock` a volajú skutočné route handlery.

---

## Konfigurácia (`.env`)

| Premenná | Popis |
| --- | --- |
| `APP_URL` | verejná adresa (OpenGraph, odkazy v emailoch, OAuth, kontrola Origin) |
| `DATABASE_URL`, `DATABASE_POOL_MAX` | PostgreSQL a veľkosť poolu |
| `REDIS_URL` | rate limiting, deduplikácia stiahnutí, zámky plánovača |
| `AUTH_SECRET`, `DOWNLOAD_TOKEN_SECRET`, `IP_HASH_SECRET` | tajomstvá (min. 32 znakov) |
| `CLIENT_IP_HEADER` | hlavička s IP od reverznej proxy pre `npm run start` (v Dockeri ju nastavuje brána: `x-real-ip`) |
| `TRUSTED_PROXIES` | Docker brána: adresy proxy pred ňou, napr. `private_ranges` (predvolene nikto) |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | voliteľné prihlásenie cez Discord (callback `${APP_URL}/api/auth/callback/discord`) |
| `SMTP_*`, `MAIL_FROM` | odosielanie emailov (lokálne Mailpit) |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile; testovacie kľúče fungujú iba pri `APP_URL` na localhoste |
| `STORAGE_DRIVER` | `LOCAL_DISK` (predvolené, Docker volume) alebo `S3_COMPATIBLE` (R2, MinIO, S3: `S3_*`) |
| `UPLOAD_MAX_FILE_BYTES`, `UPLOAD_CHUNK_BYTES`, `UPLOAD_MAX_IMAGE_BYTES`, `UPLOAD_EXPIRY_HOURS` | limity uploadu |
| `SEVEN_ZIP_PATH`, `ARCHIVE_MAX_ENTRIES`, `ARCHIVE_MAX_UNCOMPRESSED_BYTES` | kontrola archívov |
| `SEED_DEMO_DATA` | `true` = ukážkové dáta pri prvom spustení |

Administrátor môže za behu vypnúť nahrávanie alebo registráciu a znížiť limity v **/admin/nastavenia**.
Limit z `.env` je pritom vždy horná hranica.

---

## Funkcie

### Sťahovanie
- Pri každom súbore je SHA-256 a nápoveda, kam ho rozbaliť do OMSI 2.
- Pred stiahnutím sa dá rozbaliť strom obsahu archívu.
- Patch je zvýraznený pod hlavným súborom. Voliteľné súbory majú vlastnú sekciu, staršie verzie sú v rozbaľovacom archíve.
- Pri povinných závislostiach (Steam DLC, mody z portálu, externé odkazy) a pri 4GB Patchi sa pred stiahnutím zobrazí dialóg.
- `POST /api/download` vydá 30-minútový HMAC token viazaný na hash IP klienta (ochrana proti hotlinkovaniu).
  `GET /api/download/[token]` posiela `Accept-Ranges`, odpovedá `206 Partial Content`, `416` aj na `If-Range`
  a vracia ETag rovný SHA-256.
- Počítadlo pripočíta jedno stiahnutie na používateľa alebo hash IP za 24 h. Naväzovanie prerušeného sťahovania štatistiku nezvyšuje.

### Upload a kontrola súborov
- Súbory sa nahrávajú po častiach (16 MiB) a dá sa naviazať po výpadku. Ukazuje sa priebeh v MB/GB, rýchlosť a odhad zostávajúceho času.
- Povolené prípony sú `.zip .7z .rar .ams .hof .pdf`. Prípona musí sedieť s magic bytes, takže premenovaný `.exe` neprejde.
- Zamietne sa archív so Zip Slip (`../`), absolútnymi cestami, symlinkami, bidi znakmi v menách, so šifrovaním,
  so zip bombou alebo so súbormi `.exe .msi .bat .cmd .ps1 .vbs .js .scr .hta .com .pif …`.
- Na manuálnu kontrolu moderátorom ide `.dll` plugin, vnorený archív alebo archív, ktorý sa nedá prečítať.
- Screenshoty sa vždy znovu zakódujú cez sharp do WebP (náhľad 16:9). EXIF a GPS sa odstránia a prípadný
  prilepený škodlivý kód (polyglot) zanikne. SVG a HTML sú zakázané.

### Katalóg a komunita
- Vyhľadávanie funguje bez ohľadu na diakritiku a veľkosť písmen (`omsi_normalize()` nad GIN trigram indexom).
  Filtruje sa podľa kategórie, podkategórie, značky, dopravcu a 4GB Patchu, s piatimi spôsobmi zoradenia a okamžitými návrhmi.
- Recenzie (1 na používateľa, nie na vlastný mod) sú oddelené od hlásení chýb, ktoré majú pole na `logfile.txt`.
- Upload Wizard má 6 krokov a koncept sa ukladá na server. „Moje modifikácie“ umožňujú vydať novú verziu.
- Pripravované vydania majú tri režimy (presný dátum, obdobie, TBA), stav vývoja po častiach a devlogy s diskusiou.
  Naplánované vydanie sa odomkne automaticky v čase vydania.
- Projekty sa dajú sledovať. Upozornenia sa zobrazia vo zvončeku a raz za čas prídu ako súhrnný email v jazyku používateľa.

### Moderácia a administrácia (`/admin`)
- **Schvaľovanie** zobrazuje nahratý archív, zoznam súborov, SHA-256 a nálezy kontroly. Moderátor môže
  schváliť, vrátiť s komentárom alebo zamietnuť, a samostatne povoliť alebo zablokovať súbor. Overení autori
  (`VERIFIED_CREATOR`) zverejňujú okamžite.
- **Nahlásenia** (kradnutý model, chýbajúce kredity, reupload, poškodený alebo podozrivý súbor…) sa dajú vyriešiť
  a zároveň skryť mod alebo recenziu.
- Ďalšie sekcie: **používatelia** (zmena roly, dočasný aj trvalý ban), **modifikácie** (odporúčané, skryť),
  **kategórie**, **nastavenia** a **audit log** všetkých bezpečnostných a moderačných akcií.

### Bezpečnosť
- Oprávnenia sa kontrolujú na serveri v každej akcii aj endpointe. Rola sa vždy číta z DB a ban okamžite zruší všetky session.
- Všetky vstupy validuje zod. Fulltext používa iba parametrizované `Prisma.sql`.
- Markdown sanitizuje `rehype-sanitize`: žiadne HTML ani `javascript:` odkazy. YouTube sa vkladá iba cez `youtube-nocookie.com`.
- CSP s nonce pre každú požiadavku, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, HSTS a session cookies `HttpOnly` + `SameSite=Lax`.
- Redis rate limit pokrýva prihlásenie, registráciu, obnovu hesla, komentáre, nahlásenia, uploady a download tokeny.
  Prihlasovanie je pri výpadku Redisu fail-closed. Formuláre chráni Turnstile.
- IP adresy sa ukladajú iba ako HMAC hash.

### Plánovač (`src/instrumentation.ts`)
Úlohy zabezpečuje Redis zámok, takže pri viacerých inštanciách beží každá iba raz:
`publish-scheduled` (1 min.), `notification-emails` (5 min.) a `cleanup-uploads` (15 min.: nedokončené uploady
a nepriradené obrázky).

---

## Štruktúra

```
prisma/            schéma, migrácie (unaccent, pg_trgm, trigger vyhľadávania), seed.ts
src/app/           stránky (App Router), route handlery /api/*, server actions
src/server/        služby: auth, uploads, inspection, downloads, mods, admin, mail, jobs, storage, security
src/components/    UI (katalóg, detail modu, wizard, plánovanie, administrácia)
src/i18n/          slovenčina (predvolená) a čeština
tests/             unit testy + tests/integration (PGlite)
```
