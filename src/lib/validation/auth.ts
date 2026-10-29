import { z } from "zod";

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

/** Rezervované používateľské mená – nemôžu sa zameniť s administráciou ani systémovými cestami. */
const RESERVED_USERNAMES = new Set([
  "admin", "administrator", "moderator", "mod", "root", "system", "support", "podpora", "omsi", "omsidepo",
  "depo", "api", "auth", "ucet", "nahrat", "mody", "pripravovane", "prihlasenie", "registracia", "null",
  "undefined", "anonymous", "guest", "staff", "team", "discord", "noreply",
]);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "EMAIL_INVALID")
  .pipe(z.email("EMAIL_INVALID"));

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "USERNAME_LENGTH")
  .max(24, "USERNAME_LENGTH")
  .regex(/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/, "USERNAME_FORMAT")
  .refine((value) => !/[._-]{2}/.test(value), "USERNAME_FORMAT")
  .refine((value) => !RESERVED_USERNAMES.has(value), "USERNAME_RESERVED");

export const displayNameSchema = z
  .string()
  .trim()
  .min(2, "NAME_LENGTH")
  .max(40, "NAME_LENGTH")
  // Žiadne riadiace znaky ani neviditeľné formátovacie znaky (bidi override a pod.)
  .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value), "NAME_FORMAT");

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, "PASSWORD_LENGTH")
  .max(PASSWORD_MAX, "PASSWORD_LENGTH")
  .refine((value) => /\p{L}/u.test(value) && /[\p{N}\p{P}\p{S}]/u.test(value), "PASSWORD_WEAK");

const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.null(), z.undefined()])
  .transform((value) => value === "on" || value === "true");

export const signUpSchema = z
  .object({
    name: displayNameSchema,
    username: usernameSchema,
    email: emailSchema,
    password: passwordSchema,
    passwordConfirm: z.string(),
    acceptTerms: checkbox,
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.passwordConfirm) {
      ctx.addIssue({ code: "custom", path: ["passwordConfirm"], message: "PASSWORD_MISMATCH" });
    }
    const lowered = data.password.toLowerCase();
    if (lowered.includes(data.username) || lowered.includes(data.email.split("@")[0] ?? "\u0000")) {
      ctx.addIssue({ code: "custom", path: ["password"], message: "PASSWORD_CONTAINS_IDENTITY" });
    }
    if (!data.acceptTerms) {
      ctx.addIssue({ code: "custom", path: ["acceptTerms"], message: "TERMS_REQUIRED" });
    }
  });

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "PASSWORD_REQUIRED").max(PASSWORD_MAX, "PASSWORD_LENGTH"),
  next: z.string().max(512).optional(),
});

export const emailOnlySchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({
    token: z.string().min(10).max(512).regex(/^[A-Za-z0-9_-]+$/, "TOKEN_INVALID"),
    password: passwordSchema,
    passwordConfirm: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    path: ["passwordConfirm"],
    message: "PASSWORD_MISMATCH",
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "PASSWORD_REQUIRED").max(PASSWORD_MAX),
    password: passwordSchema,
    passwordConfirm: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    path: ["passwordConfirm"],
    message: "PASSWORD_MISMATCH",
  })
  .refine((data) => data.password !== data.currentPassword, {
    path: ["password"],
    message: "PASSWORD_SAME",
  });

export const profileSchema = z.object({
  name: displayNameSchema,
  bio: z
    .string()
    .trim()
    .max(500, "BIO_LENGTH")
    .transform((value) => (value.length === 0 ? null : value)),
  locale: z.enum(["sk", "cs"]),
  emailNotify: checkbox,
});

/** Bezpečný návrat po prihlásení – iba relatívna cesta na tomto webe (žiadny open redirect). */
export function safeRedirectPath(value: unknown, fallback = "/"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\\]/.test(value)) return fallback;
  if (value.startsWith("/api/")) return fallback;
  return value.slice(0, 512);
}
