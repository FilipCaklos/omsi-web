// Deterministické testovacie prostredie – žiadne skutočné tajomstvá ani služby
Object.assign(process.env, {
  NODE_ENV: "test",
  APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  REDIS_URL: "redis://localhost:6379/0",
  AUTH_SECRET: "test-auth-secret-0123456789abcdef0123456789",
  DOWNLOAD_TOKEN_SECRET: "test-download-secret-0123456789abcdef012345",
  IP_HASH_SECRET: "test-ip-hash-secret-0123456789abcdef01234567",
  CLIENT_IP_HEADER: "x-forwarded-for",
  SMTP_HOST: "localhost",
  SMTP_PORT: "1025",
  MAIL_FROM: "OMSI Depo <test@omsi-depo.local>",
  TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
  TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
});
