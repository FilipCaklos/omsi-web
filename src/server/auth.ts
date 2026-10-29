import "server-only";
import { randomInt } from "node:crypto";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { isLocale, type AppLocale } from "@/i18n/config";
import { db } from "@/lib/db";
import { env, isDiscordEnabled } from "@/lib/env";
import { usernameSchema } from "@/lib/validation/auth";
import { audit } from "@/server/audit";
import { sendMailInBackground } from "@/server/mail/transport";
import {
  existingAccountMail,
  passwordChangedMail,
  resetPasswordMail,
  verifyEmailMail,
} from "@/server/mail/templates";
import { hashPassword, verifyPassword } from "@/server/security/password";
import { getSettings } from "@/server/settings";

export const EMAIL_VERIFICATION_CALLBACK = "/overenie-emailu";
export const PASSWORD_RESET_CALLBACK = "/obnova-hesla";
export const AUTH_ERROR_PAGE = "/prihlasenie";

function userLocale(user: Record<string, unknown>): AppLocale {
  return isLocale(user.locale) ? user.locale : "sk";
}

/** Bezpečný základ používateľského mena z Discord profilu (bez diakritiky, len povolené znaky). */
function usernameBase(source: string): string {
  const cleaned = source
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "")
    .replace(/[._-]{2,}/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 18);
  return cleaned.length >= 3 ? cleaned : `vodic${cleaned}`;
}

async function generateUniqueUsername(source: string): Promise<string> {
  const base = usernameBase(source);
  const candidates = [base, ...Array.from({ length: 8 }, () => `${base}${randomInt(100, 9999)}`)];
  for (const candidate of candidates) {
    if (!usernameSchema.safeParse(candidate).success) continue;
    const taken = await db().user.findUnique({ where: { username: candidate }, select: { id: true } });
    if (!taken) return candidate;
  }
  return `vodic${Date.now().toString(36)}${randomInt(10, 99)}`;
}

function isBanned(user: { bannedAt: Date | null; bannedUntil: Date | null }): boolean {
  if (!user.bannedAt) return false;
  return user.bannedUntil === null || user.bannedUntil.getTime() > Date.now();
}

function createAuth() {
  const e = env();

  return betterAuth({
    appName: "OMSI Depo",
    baseURL: e.APP_URL,
    basePath: "/api/auth",
    secret: e.AUTH_SECRET,
    trustedOrigins: [e.APP_URL],
    database: prismaAdapter(db(), { provider: "postgresql" }),
    telemetry: { enabled: false },

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      password: { hash: hashPassword, verify: verifyPassword },
      sendResetPassword: async ({ user, url }) => {
        sendMailInBackground(resetPasswordMail(userLocale(user), user.email, user.name, url));
      },
      onPasswordReset: async ({ user }) => {
        await audit({ action: "auth.password_reset", actorId: user.id, targetType: "user", targetId: user.id });
        sendMailInBackground(
          passwordChangedMail(userLocale(user), user.email, user.name, `${e.APP_URL}/zabudnute-heslo`),
        );
      },
      onExistingUserSignUp: async ({ user }) => {
        sendMailInBackground(existingAccountMail(userLocale(user), user.email, user.name, `${e.APP_URL}/prihlasenie`));
      },
    },

    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: false,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60 * 24,
      sendVerificationEmail: async ({ user, url }) => {
        sendMailInBackground(verifyEmailMail(userLocale(user), user.email, user.name, url));
      },
      afterEmailVerification: async (user) => {
        await audit({ action: "auth.email_verified", actorId: user.id, targetType: "user", targetId: user.id });
      },
    },

    socialProviders: isDiscordEnabled()
      ? {
          discord: {
            clientId: e.DISCORD_CLIENT_ID,
            clientSecret: e.DISCORD_CLIENT_SECRET,
            scope: ["identify", "email"],
          },
        }
      : {},

    account: {
      accountLinking: { enabled: true, trustedProviders: ["discord"], allowDifferentEmails: false },
    },

    user: {
      additionalFields: {
        username: { type: "string", required: false, input: true },
        role: { type: "string", required: false, input: false, defaultValue: "USER" },
        locale: { type: "string", required: false, input: true, defaultValue: "sk" },
      },
      changeEmail: { enabled: false },
      deleteUser: { enabled: false },
    },

    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },

    // Vlastný Redis rate limiter beží v Server Actions (src/server/security/rate-limit.ts)
    rateLimit: { enabled: false },

    advanced: {
      cookiePrefix: "omsi",
      useSecureCookies: e.APP_URL.startsWith("https://"),
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
      ipAddress: { ipAddressHeaders: [e.CLIENT_IP_HEADER] },
    },

    onAPIError: { errorURL: AUTH_ERROR_PAGE },

    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (!(await getSettings()).registrationEnabled) {
              throw new APIError("FORBIDDEN", { message: "REGISTRATION_DISABLED", code: "REGISTRATION_DISABLED" });
            }
            const requested = typeof user.username === "string" ? usernameSchema.safeParse(user.username) : null;
            const username =
              requested?.success === true
                ? requested.data
                : await generateUniqueUsername(user.name || user.email.split("@")[0] || "vodic");
            return {
              data: {
                ...user,
                username,
                // Rola sa pri registrácii nikdy neberie zo vstupu
                role: "USER",
                locale: isLocale(user.locale) ? user.locale : "sk",
              },
            };
          },
          after: async (user) => {
            await audit({
              action: "auth.sign_up",
              actorId: user.id,
              targetType: "user",
              targetId: user.id,
              metadata: { username: String(user.username ?? "") },
            });
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const user = await db().user.findUnique({
              where: { id: session.userId },
              select: { bannedAt: true, bannedUntil: true },
            });
            if (!user || isBanned(user)) {
              await audit({ action: "auth.sign_in_blocked", actorId: session.userId, targetType: "user", targetId: session.userId });
              throw new APIError("FORBIDDEN", { message: "ACCOUNT_BANNED", code: "ACCOUNT_BANNED" });
            }
          },
          after: async (session, context) => {
            await db().user.update({ where: { id: session.userId }, data: { lastLoginAt: new Date() } });
            // Jedno miesto pre audit všetkých prihlásení: email/heslo, Discord aj auto-login po overení emailu
            await audit({
              action: "auth.sign_in",
              actorId: session.userId,
              targetType: "session",
              targetId: session.id,
              metadata: { via: context?.path ?? "unknown" },
              headers: context?.headers ?? undefined,
            });
          },
        },
      },
    },

    plugins: [nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { auth?: Auth };

/** Lenivá inštancia – konfigurácia sa číta až za behu, nie počas `next build`. */
export function getAuth(): Auth {
  if (!globalForAuth.auth) globalForAuth.auth = createAuth();
  return globalForAuth.auth;
}

export { APIError };
