"use server";

import { redirect } from "next/navigation";
import { getLocale } from "@/i18n/server";
import { db } from "@/lib/db";
import { isDiscordEnabled } from "@/lib/env";
import { zodFieldErrors, type AuthErrorCode, type FormState } from "@/lib/form-state";
import {
  emailOnlySchema,
  resetPasswordSchema,
  safeRedirectPath,
  signInSchema,
  signUpSchema,
} from "@/lib/validation/auth";
import { failure, field, guardForm, previousAttempt, requestContext } from "@/server/action-guard";
import { audit } from "@/server/audit";
import {
  APIError,
  AUTH_ERROR_PAGE,
  EMAIL_VERIFICATION_CALLBACK,
  PASSWORD_RESET_CALLBACK,
  getAuth,
} from "@/server/auth";
import { hashIdentifier } from "@/server/security/ip";
import { RATE_LIMITS } from "@/server/security/rate-limit";

/** Prevod chýb Better Auth na naše lokalizované kódy (nikdy neposielame surovú správu). */
function mapAuthError(error: unknown): AuthErrorCode {
  if (error instanceof APIError) {
    const body = (error.body ?? {}) as { code?: string; message?: string };
    const code = body.code ?? body.message ?? "";
    switch (code) {
      case "INVALID_EMAIL_OR_PASSWORD":
      case "INVALID_EMAIL":
      case "INVALID_PASSWORD":
      case "CREDENTIAL_ACCOUNT_NOT_FOUND":
        return "INVALID_CREDENTIALS";
      case "EMAIL_NOT_VERIFIED":
        return "EMAIL_NOT_VERIFIED";
      case "ACCOUNT_BANNED":
        return "ACCOUNT_BANNED";
      case "REGISTRATION_DISABLED":
        return "REGISTRATION_DISABLED";
      case "INVALID_TOKEN":
      case "TOKEN_EXPIRED":
        return "TOKEN_INVALID";
      case "PASSWORD_TOO_SHORT":
      case "PASSWORD_TOO_LONG":
        return "PASSWORD_LENGTH";
      default:
        console.error("[auth] neočakávaná chyba Better Auth:", error.status, code);
        return "GENERIC";
    }
  }
  console.error("[auth] neočakávaná chyba:", error instanceof Error ? error.message : error);
  return "GENERIC";
}

// ───────────────────────────── Registrácia ─────────────────────────────

export async function signUpAction(state: FormState, formData: FormData): Promise<FormState> {
  const attempt = previousAttempt(state);
  const ctx = await requestContext();

  const parsed = signUpSchema.safeParse({
    name: field(formData, "name"),
    username: field(formData, "username"),
    email: field(formData, "email"),
    password: field(formData, "password"),
    passwordConfirm: field(formData, "passwordConfirm"),
    acceptTerms: field(formData, "acceptTerms"),
  });
  const values = {
    name: field(formData, "name") ?? "",
    username: field(formData, "username") ?? "",
    email: field(formData, "email") ?? "",
  };
  if (!parsed.success) {
    return { status: "error", fieldErrors: zodFieldErrors(parsed.error), values, attempt: attempt + 1 };
  }
  const data = parsed.data;

  const blocked = await guardForm({
    ctx,
    attempt,
    formData,
    requireTurnstile: true,
    limits: [[RATE_LIMITS.signUpIp, ctx.ipHash]],
  });
  if (blocked) return { ...blocked, values };

  // Používateľské mená sú verejné (URL profilu), ich obsadenosť preto môžeme prezradiť
  const taken = await db().user.findUnique({ where: { username: data.username }, select: { id: true } });
  if (taken) return failure(attempt, "GENERIC", { fieldErrors: { username: "USERNAME_TAKEN" }, values });

  try {
    await getAuth().api.signUpEmail({
      body: {
        name: data.name,
        email: data.email,
        password: data.password,
        username: data.username,
        locale: await getLocale(),
        callbackURL: EMAIL_VERIFICATION_CALLBACK,
      },
      headers: ctx.headers,
    });
  } catch (error) {
    // Súbeh dvoch registrácií s rovnakým menom → unikátny index v DB
    if (error instanceof Error && /Unique constraint|P2002/i.test(error.message)) {
      return failure(attempt, "GENERIC", { fieldErrors: { username: "USERNAME_TAKEN" }, values });
    }
    return failure(attempt, mapAuthError(error), { values });
  }

  // Rovnaká odpoveď pre nový aj existujúci email (ochrana proti enumerácii účtov)
  return { status: "success", email: data.email, attempt: attempt + 1 };
}

// ───────────────────────────── Prihlásenie ─────────────────────────────

export async function signInAction(state: FormState, formData: FormData): Promise<FormState> {
  const attempt = previousAttempt(state);
  const ctx = await requestContext();

  const parsed = signInSchema.safeParse({
    email: field(formData, "email"),
    password: field(formData, "password"),
    next: field(formData, "next"),
  });
  const values = { email: field(formData, "email") ?? "" };
  if (!parsed.success) {
    return { status: "error", fieldErrors: zodFieldErrors(parsed.error), values, attempt: attempt + 1 };
  }
  const { email, password } = parsed.data;
  const emailHash = hashIdentifier(email);

  const blocked = await guardForm({
    ctx,
    attempt,
    formData,
    requireTurnstile: true,
    limits: [
      [RATE_LIMITS.signInIp, ctx.ipHash],
      [RATE_LIMITS.signInAccount, emailHash],
    ],
  });
  if (blocked) return { ...blocked, values };

  try {
    await getAuth().api.signInEmail({
      body: { email, password, rememberMe: true },
      headers: ctx.headers,
    });
  } catch (error) {
    const code = mapAuthError(error);
    await audit({
      action: "auth.sign_in_failed",
      metadata: { emailHash, reason: code },
      headers: ctx.headers,
    });
    return failure(attempt, code, code === "EMAIL_NOT_VERIFIED" ? { email, values } : { values });
  }

  redirect(safeRedirectPath(parsed.data.next, "/"));
}

export async function discordSignInAction(formData: FormData): Promise<void> {
  const ctx = await requestContext();
  const next = safeRedirectPath(field(formData, "next"), "/");
  if (!isDiscordEnabled()) redirect(`${AUTH_ERROR_PAGE}?error=DISCORD_DISABLED`);

  const blocked = await guardForm({
    ctx,
    attempt: 0,
    requireTurnstile: false,
    limits: [[RATE_LIMITS.socialSignInIp, ctx.ipHash]],
  });
  if (blocked) redirect(`${AUTH_ERROR_PAGE}?error=RATE_LIMITED`);

  let url: string | undefined;
  try {
    const result = await getAuth().api.signInSocial({
      body: {
        provider: "discord",
        callbackURL: next,
        errorCallbackURL: AUTH_ERROR_PAGE,
        newUserCallbackURL: "/ucet",
        disableRedirect: true,
      },
      headers: ctx.headers,
    });
    url = result.url;
  } catch (error) {
    mapAuthError(error);
  }
  if (!url || !url.startsWith("https://discord.com/")) redirect(`${AUTH_ERROR_PAGE}?error=OAUTH_FAILED`);
  redirect(url);
}

export async function signOutAction(): Promise<void> {
  const ctx = await requestContext();
  const session = await getAuth().api.getSession({ headers: ctx.headers });
  if (session) {
    await getAuth().api.signOut({ headers: ctx.headers });
    await audit({ action: "auth.sign_out", actorId: session.user.id, headers: ctx.headers });
  }
  redirect("/");
}

// ───────────────────────────── Overenie emailu ─────────────────────────────

export async function resendVerificationAction(state: FormState, formData: FormData): Promise<FormState> {
  const attempt = previousAttempt(state);
  const ctx = await requestContext();
  const parsed = emailOnlySchema.safeParse({ email: field(formData, "email") });
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error), attempt: attempt + 1 };

  const emailHash = hashIdentifier(parsed.data.email);
  const blocked = await guardForm({
    ctx,
    attempt,
    requireTurnstile: false,
    limits: [
      [RATE_LIMITS.verifyEmailIp, ctx.ipHash],
      [RATE_LIMITS.verifyEmailAccount, emailHash],
    ],
  });
  if (blocked) return blocked;

  try {
    await getAuth().api.sendVerificationEmail({
      body: { email: parsed.data.email, callbackURL: EMAIL_VERIFICATION_CALLBACK },
      headers: ctx.headers,
    });
  } catch (error) {
    // Neexistujúci alebo už overený účet – zámerne rovnaká odpoveď
    if (!(error instanceof APIError)) mapAuthError(error);
  }
  await audit({ action: "auth.verification_resent", metadata: { emailHash }, headers: ctx.headers });
  return { status: "success", attempt: attempt + 1 };
}

// ───────────────────────────── Obnova hesla ─────────────────────────────

export async function requestPasswordResetAction(state: FormState, formData: FormData): Promise<FormState> {
  const attempt = previousAttempt(state);
  const ctx = await requestContext();
  const parsed = emailOnlySchema.safeParse({ email: field(formData, "email") });
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error), attempt: attempt + 1 };

  const emailHash = hashIdentifier(parsed.data.email);
  const blocked = await guardForm({
    ctx,
    attempt,
    formData,
    requireTurnstile: true,
    limits: [
      [RATE_LIMITS.passwordResetIp, ctx.ipHash],
      [RATE_LIMITS.passwordResetAccount, emailHash],
    ],
  });
  if (blocked) return blocked;

  try {
    await getAuth().api.requestPasswordReset({
      body: { email: parsed.data.email, redirectTo: PASSWORD_RESET_CALLBACK },
      headers: ctx.headers,
    });
  } catch (error) {
    if (!(error instanceof APIError)) mapAuthError(error);
  }
  await audit({ action: "auth.password_reset_requested", metadata: { emailHash }, headers: ctx.headers });
  return { status: "success", attempt: attempt + 1 };
}

export async function resetPasswordAction(state: FormState, formData: FormData): Promise<FormState> {
  const attempt = previousAttempt(state);
  const ctx = await requestContext();
  const parsed = resetPasswordSchema.safeParse({
    token: field(formData, "token"),
    password: field(formData, "password"),
    passwordConfirm: field(formData, "passwordConfirm"),
  });
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error), attempt: attempt + 1 };

  const blocked = await guardForm({
    ctx,
    attempt,
    requireTurnstile: false,
    limits: [[RATE_LIMITS.passwordResetIp, ctx.ipHash]],
  });
  if (blocked) return blocked;

  try {
    await getAuth().api.resetPassword({
      body: { newPassword: parsed.data.password, token: parsed.data.token },
      headers: ctx.headers,
    });
  } catch (error) {
    return failure(attempt, mapAuthError(error));
  }
  return { status: "success", attempt: attempt + 1 };
}
