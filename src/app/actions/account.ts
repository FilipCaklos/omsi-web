"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { LOCALE_COOKIE } from "@/i18n/config";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { zodFieldErrors, type FormState } from "@/lib/form-state";
import { changePasswordSchema, profileSchema } from "@/lib/validation/auth";
import { failure, field, guardForm, previousAttempt, requestContext } from "@/server/action-guard";
import { audit } from "@/server/audit";
import { APIError, getAuth } from "@/server/auth";
import { passwordChangedMail } from "@/server/mail/templates";
import { sendMailInBackground } from "@/server/mail/transport";
import { RATE_LIMITS } from "@/server/security/rate-limit";
import { AccessDeniedError, requireUser } from "@/server/session";

async function currentUserOrError(attempt: number) {
  try {
    return { user: await requireUser(), error: null };
  } catch (error) {
    if (error instanceof AccessDeniedError) return { user: null, error: failure(attempt, error.code) };
    throw error;
  }
}

export async function updateProfileAction(state: FormState, formData: FormData): Promise<FormState> {
  const attempt = previousAttempt(state);
  const { user, error } = await currentUserOrError(attempt);
  if (!user) return error;

  const parsed = profileSchema.safeParse({
    name: field(formData, "name"),
    bio: field(formData, "bio") ?? "",
    locale: field(formData, "locale"),
    emailNotify: field(formData, "emailNotify"),
    websiteUrl: field(formData, "websiteUrl") ?? "",
    youtubeUrl: field(formData, "youtubeUrl") ?? "",
    discordUrl: field(formData, "discordUrl") ?? "",
    donateUrl: field(formData, "donateUrl") ?? "",
  });
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error), attempt: attempt + 1 };

  const ctx = await requestContext();
  const blocked = await guardForm({
    ctx,
    attempt,
    requireTurnstile: false,
    limits: [[RATE_LIMITS.profileUpdate, user.id]],
    auditActorId: user.id,
  });
  if (blocked) return blocked;

  await db().user.update({
    where: { id: user.id },
    data: {
      name: parsed.data.name,
      bio: parsed.data.bio,
      locale: parsed.data.locale,
      emailNotify: parsed.data.emailNotify,
      websiteUrl: parsed.data.websiteUrl,
      youtubeUrl: parsed.data.youtubeUrl,
      discordUrl: parsed.data.discordUrl,
      donateUrl: parsed.data.donateUrl,
    },
  });
  (await cookies()).set(LOCALE_COOKIE, parsed.data.locale, {
    httpOnly: true,
    sameSite: "lax",
    secure: env().APP_URL.startsWith("https://"),
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  await audit({
    action: "user.profile_updated",
    actorId: user.id,
    targetType: "user",
    targetId: user.id,
    headers: ctx.headers,
  });
  revalidatePath("/", "layout");
  return { status: "success", attempt: attempt + 1 };
}

export async function changePasswordAction(state: FormState, formData: FormData): Promise<FormState> {
  const attempt = previousAttempt(state);
  const { user, error } = await currentUserOrError(attempt);
  if (!user) return error;

  const parsed = changePasswordSchema.safeParse({
    currentPassword: field(formData, "currentPassword"),
    password: field(formData, "password"),
    passwordConfirm: field(formData, "passwordConfirm"),
  });
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error), attempt: attempt + 1 };

  const ctx = await requestContext();
  const blocked = await guardForm({
    ctx,
    attempt,
    requireTurnstile: false,
    limits: [[RATE_LIMITS.changePassword, user.id]],
    auditActorId: user.id,
  });
  if (blocked) return blocked;

  const credential = await db().account.findFirst({
    where: { userId: user.id, providerId: "credential", password: { not: null } },
    select: { id: true },
  });
  if (!credential) return failure(attempt, "NO_PASSWORD");

  try {
    await getAuth().api.changePassword({
      body: {
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.password,
        revokeOtherSessions: true,
      },
      headers: ctx.headers,
    });
  } catch (err) {
    if (err instanceof APIError) return failure(attempt, "WRONG_PASSWORD", { fieldErrors: { currentPassword: "WRONG_PASSWORD" } });
    throw err;
  }

  await audit({ action: "auth.password_changed", actorId: user.id, targetType: "user", targetId: user.id, headers: ctx.headers });
  sendMailInBackground(passwordChangedMail(user.locale, user.email, user.name, `${env().APP_URL}/zabudnute-heslo`));
  revalidatePath("/ucet");
  return { status: "success", attempt: attempt + 1 };
}

/** Odhlásenie konkrétneho zariadenia – iba vlastnej session, podľa ID (token nikdy neopúšťa server). */
export async function revokeSessionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const sessionId = field(formData, "sessionId");
  if (!sessionId || sessionId === user.sessionId || !/^[A-Za-z0-9_-]{8,64}$/.test(sessionId)) return;

  const ctx = await requestContext();
  const { count } = await db().session.deleteMany({ where: { id: sessionId, userId: user.id } });
  if (count > 0) {
    await audit({ action: "auth.session_revoked", actorId: user.id, targetType: "session", targetId: sessionId, headers: ctx.headers });
  }
  revalidatePath("/ucet");
}

export async function revokeOtherSessionsAction(): Promise<void> {
  const user = await requireUser();
  const ctx = await requestContext();
  const { count } = await db().session.deleteMany({ where: { userId: user.id, id: { not: user.sessionId } } });
  await audit({
    action: "auth.sessions_revoked_all",
    actorId: user.id,
    targetType: "user",
    targetId: user.id,
    metadata: { count },
    headers: ctx.headers,
  });
  revalidatePath("/ucet");
}
