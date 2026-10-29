# syntax=docker/dockerfile:1.7
# OMSI Depo – viacstupňový produkčný build (Next.js standalone)

ARG NODE_IMAGE=node:24-bookworm-slim

# ─── 1) Závislosti ───────────────────────────────────────────
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
# DATABASE_URL je potrebná iba na načítanie prisma.config.ts pri `prisma generate` (postinstall)
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npm ci --no-audit --no-fund

# ─── 2) Build ────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npx prisma generate \
 && npm run build

# ─── 3) Migrácie a seed (jednorazový kontajner) ───────────────
FROM ${NODE_IMAGE} AS migrator
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json
ENV STORAGE_LOCAL_ROOT=/data/storage
RUN mkdir -p /data/storage && chown -R node:node /data
USER node
# Migrácie + idempotentný seed (číselníky vždy; ukážkové dáta iba pri SEED_DEMO_DATA=true)
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed"]

# ─── 3b) Oficiálny 7-Zip (7zz) – čítanie obsahu .7z/.rar archívov ───
# Debian balík 7zip neobsahuje RAR modul, preto berieme oficiálny build s overeným SHA-256.
FROM ${NODE_IMAGE} AS sevenzip
ARG TARGETARCH
ARG SEVENZIP_VERSION=2601
ARG SEVENZIP_SHA256_AMD64=8ea0fc8a135e7b848e80a4116fe22dff56c8c4518dde1f43cce67f4e340b437a
ARG SEVENZIP_SHA256_ARM64=39f8c9070c300a63c7484d9a983119ef3edf841e1ddf69f1affae29fdec5f612
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl xz-utils \
 && rm -rf /var/lib/apt/lists/* \
 && case "${TARGETARCH:-amd64}" in \
      amd64) ARCH=x64; SUM="${SEVENZIP_SHA256_AMD64}" ;; \
      arm64) ARCH=arm64; SUM="${SEVENZIP_SHA256_ARM64}" ;; \
      *) echo "Nepodporovaná architektúra: ${TARGETARCH}" >&2; exit 1 ;; \
    esac \
 && curl -fsSL -o /tmp/7z.tar.xz "https://www.7-zip.org/a/7z${SEVENZIP_VERSION}-linux-${ARCH}.tar.xz" \
 && echo "${SUM}  /tmp/7z.tar.xz" | sha256sum -c - \
 && mkdir -p /opt/7zip \
 && tar -xJf /tmp/7z.tar.xz -C /opt/7zip 7zz \
 && chmod 0755 /opt/7zip/7zz \
 && rm /tmp/7z.tar.xz

# ─── 4) Produkčný runtime ────────────────────────────────────
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    STORAGE_LOCAL_ROOT=/data/storage \
    SEVEN_ZIP_PATH=/usr/local/bin/7zz

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates tini \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /data/storage \
 && chown -R node:node /data

COPY --from=sevenzip /opt/7zip/7zz /usr/local/bin/7zz
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

USER node
VOLUME ["/data/storage"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]
