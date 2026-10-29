#!/usr/bin/env bash
# OMSI Depo – prvé nasadenie na Linux serveri s Dockerom.
#
#   ./scripts/setup.sh                 # vytvorí .env (náhodné tajomstvá), zostaví a spustí kontajnery
#   ./scripts/setup.sh --bez-ukazok    # bez ukážkových účtov a modov (iba číselníky)
#   APP_URL=https://omsi.example.sk ./scripts/setup.sh
#
# Existujúci .env sa nikdy neprepíše – pri ďalšom spustení sa iba znovu zostavia a spustia kontajnery.
set -euo pipefail

cd "$(dirname "$0")/.."

die() { echo "CHYBA: $*" >&2; exit 1; }
info() { echo "==> $*"; }

command -v docker >/dev/null 2>&1 || die "Docker nie je nainštalovaný (https://docs.docker.com/engine/install/)."
docker compose version >/dev/null 2>&1 || die "Chýba Docker Compose v2 (príkaz 'docker compose')."
for tool in openssl curl; do command -v "$tool" >/dev/null 2>&1 || die "Chýba $tool."; done

DEMO_DATA=true
for arg in "$@"; do
  case "$arg" in
    --bez-ukazok) DEMO_DATA=false ;;
    -h|--help) sed -n '2,9p' "$0"; exit 0 ;;
    *) die "Neznámy prepínač: $arg" ;;
  esac
done

# Náhodný reťazec iba z písmen a číslic (bezpečný pre .env, URL aj sed)
secret() { openssl rand -base64 64 | tr -dc 'A-Za-z0-9' | head -c "${1:-48}"; }

set_env() {
  local key="$1" value="$2"
  if grep -q "^${key}=" .env; then
    sed -i "s|^${key}=.*|${key}=${value}|" .env
  else
    echo "${key}=${value}" >> .env
  fi
}

if [ ! -f .env ]; then
  info "Vytváram .env s náhodnými tajomstvami"
  cp .env.example .env

  if [ -z "${APP_URL:-}" ]; then
    LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
    DEFAULT_URL="http://${LAN_IP:-localhost}:3000"
    if [ -t 0 ]; then
      read -r -p "Adresa portálu [${DEFAULT_URL}]: " APP_URL
    fi
    APP_URL="${APP_URL:-$DEFAULT_URL}"
  fi
  APP_URL="${APP_URL%/}"

  DB_PASSWORD="$(secret 32)"
  set_env NODE_ENV production
  set_env APP_URL "$APP_URL"
  set_env POSTGRES_PASSWORD "$DB_PASSWORD"
  set_env DATABASE_URL "postgresql://omsi:${DB_PASSWORD}@postgres:5432/omsi_depo?schema=public"
  set_env AUTH_SECRET "$(secret 48)"
  set_env DOWNLOAD_TOKEN_SECRET "$(secret 48)"
  set_env IP_HASH_SECRET "$(secret 48)"
  set_env SEED_DEMO_DATA "$DEMO_DATA"
  # Emaily sa zatiaľ zachytávajú v Mailpite (http://127.0.0.1:8025); pre skutočné odosielanie zmeň SMTP_* v .env
  set_env SMTP_HOST mailpit
  set_env SMTP_PORT 1025
  chmod 600 .env

  case "$APP_URL" in
    https://*) echo "    Pozn.: pre verejnú doménu nastav v .env vlastné TURNSTILE_SITE_KEY a TURNSTILE_SECRET_KEY." ;;
  esac
else
  info "Používam existujúci .env (nemením ho)"
fi

info "Zostavujem a spúšťam kontajnery (prvý build trvá niekoľko minút)"
docker compose up -d --build

APP_URL_SET="$(grep '^APP_URL=' .env | cut -d= -f2-)"
info "Čakám, kým aplikácia odpovie"
for _ in $(seq 1 90); do
  if curl -fsS "http://127.0.0.1:3000/api/health" >/dev/null 2>&1; then
    echo
    info "Hotovo: ${APP_URL_SET}"
    if grep -q '^SEED_DEMO_DATA=true' .env; then
      echo "    Ukážkové účty (zmeň ich heslá alebo ich zmaž pred verejným spustením):"
      echo "      admin@omsi-depo.local / Depo-Spravca-2026  (administrátor)"
      echo "      autor@omsi-depo.local / Depo-Mapar-2026    (overený autor)"
    fi
    echo "    Emaily (Mailpit): http://127.0.0.1:8025  ·  Logy: docker compose logs -f app"
    exit 0
  fi
  sleep 2
  printf '.'
done
echo
docker compose ps
die "Aplikácia neodpovedá. Skontroluj: docker compose logs migrate app"
