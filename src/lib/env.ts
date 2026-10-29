import "server-only";
import { z } from "zod";

const secret = z.string().min(32, "Tajomstvo musí mať aspoň 32 znakov");
const booleanString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.url().transform((url) => url.replace(/\/+$/, "")),
    DATABASE_URL: z.string().startsWith("postgresql://"),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(200).default(20),
    REDIS_URL: z.string().startsWith("redis://"),

    AUTH_SECRET: secret,
    DOWNLOAD_TOKEN_SECRET: secret,
    IP_HASH_SECRET: secret,
    /** Hlavička s IP klienta od reverznej proxy (berie sa posledná hodnota reťazca). */
    CLIENT_IP_HEADER: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .default("x-forwarded-for"),

    DISCORD_CLIENT_ID: z.string().default(""),
    DISCORD_CLIENT_SECRET: z.string().default(""),

    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535),
    SMTP_USER: z.string().default(""),
    SMTP_PASSWORD: z.string().default(""),
    SMTP_SECURE: booleanString,
    MAIL_FROM: z.string().min(3),

    /** Právne stránky: kto portál prevádzkuje a kam písať (GDPR, autorské práva). Prázdne = kontakt@<doména>. */
    LEGAL_OPERATOR_NAME: z.string().trim().max(200).default(""),
    CONTACT_EMAIL: z.union([z.email(), z.literal("")]).default(""),
    /** Pozvánka na Discord server komunity (pätička webu, podpis v emailoch); prázdne = nezobrazovať */
    PUBLIC_DISCORD_URL: z.union([z.url({ protocol: /^https$/ }), z.literal("")]).default(""),

    TURNSTILE_SITE_KEY: z.string().min(1),
    TURNSTILE_SECRET_KEY: z.string().min(1),

    STORAGE_DRIVER: z.enum(["LOCAL_DISK", "S3_COMPATIBLE"]).default("LOCAL_DISK"),
    STORAGE_LOCAL_ROOT: z.string().min(1).default("./storage"),
    S3_ENDPOINT: z.string().default(""),
    S3_REGION: z.string().default("auto"),
    S3_BUCKET: z.string().default(""),
    S3_ACCESS_KEY_ID: z.string().default(""),
    S3_SECRET_ACCESS_KEY: z.string().default(""),
    S3_FORCE_PATH_STYLE: booleanString,

    UPLOAD_MAX_FILE_BYTES: z.coerce.number().int().positive().default(8 * 1024 ** 3),
    UPLOAD_CHUNK_BYTES: z.coerce
      .number()
      .int()
      .min(1024 * 1024)
      .max(64 * 1024 * 1024)
      .default(16 * 1024 * 1024),
    UPLOAD_MAX_IMAGE_BYTES: z.coerce.number().int().positive().default(15 * 1024 * 1024),
    /** Nedokončené uploady sa zmažú po tomto počte hodín */
    UPLOAD_EXPIRY_HOURS: z.coerce.number().int().min(1).max(168).default(24),

    /** Cesta k oficiálnemu 7-Zip (7zz) – čítanie .7z/.rar; ak chýba, archív ide na manuálnu kontrolu */
    SEVEN_ZIP_PATH: z.string().min(1).default("7zz"),
    ARCHIVE_MAX_ENTRIES: z.coerce.number().int().positive().default(200_000),
    ARCHIVE_MAX_UNCOMPRESSED_BYTES: z.coerce.number().int().positive().default(64 * 1024 ** 3),

    /** VirusTotal API kľúč (virustotal.com → profil → API key); prázdne = kontrola vypnutá */
    VIRUSTOTAL_API_KEY: z.string().trim().default(""),
    /** Limity bezplatného API: 4 požiadavky/min, 500/deň */
    VIRUSTOTAL_REQUESTS_PER_MINUTE: z.coerce.number().int().min(1).max(1000).default(4),
    VIRUSTOTAL_DAILY_LIMIT: z.coerce.number().int().min(1).max(1_000_000).default(480),
  })
  .superRefine((env, ctx) => {
    if (env.STORAGE_DRIVER === "S3_COMPATIBLE") {
      for (const key of ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const) {
        if (env[key].length === 0) {
          ctx.addIssue({ code: "custom", path: [key], message: "Povinné pri STORAGE_DRIVER=S3_COMPATIBLE" });
        }
      }
    }
    // Testovacie kľúče Cloudflare sú povolené iba na localhoste a v súkromnej sieti (napr. http://192.168.1.50:3000)
    const isLocalHost =
      /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|[a-z0-9-]+\.(local|lan|home\.arpa)|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/.test(
        env.APP_URL,
      );
    if (env.NODE_ENV === "production" && !isLocalHost && env.TURNSTILE_SECRET_KEY.startsWith("1x0000")) {
      ctx.addIssue({
        code: "custom",
        path: ["TURNSTILE_SECRET_KEY"],
        message: "V produkcii nie je povolený testovací Turnstile kľúč",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/**
 * Konfigurácia sa validuje lenivo pri prvom použití za behu servera,
 * aby `next build` nevyžadoval produkčné tajomstvá.
 */
export function env(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `  • ${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(`Neplatná konfigurácia prostredia (.env):\n${details}`);
  }
  cached = parsed.data;
  return cached;
}

/** Kontaktný email z CONTACT_EMAIL, inak kontakt@<doména z APP_URL>. */
export function contactEmail(): string {
  const e = env();
  return e.CONTACT_EMAIL || `kontakt@${new URL(e.APP_URL).hostname}`;
}

export function isDiscordEnabled(): boolean {
  const e = env();
  return e.DISCORD_CLIENT_ID.length > 0 && e.DISCORD_CLIENT_SECRET.length > 0;
}
