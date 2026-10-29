"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import type { FormState } from "@/lib/form-state";
import { can } from "@/lib/rbac";
import { failure, field, guardForm, keepValues, previousAttempt, requestContext } from "@/server/action-guard";
import { audit } from "@/server/audit";
import { renderMarkdown } from "@/server/markdown";
import { notify } from "@/server/notifications";
import { RATE_LIMITS } from "@/server/security/rate-limit";
import { AccessDeniedError, requireUser, type CurrentUser } from "@/server/session";

const LOGFILE_MAX = 64 * 1024;

async function actor(attempt: number): Promise<{ user: CurrentUser } | { error: FormState }> {
  try {
    const user = await requireUser();
    if (!user.emailVerified) return { error: failure(attempt, "EMAIL_NOT_VERIFIED") };
    return { user };
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: failure(attempt, error.code) };
    throw error;
  }
}

async function publicMod(modId: unknown) {
  if (typeof modId !== "string" || !/^[a-z0-9]{10,40}$/.test(modId)) return null;
  return db().mod.findFirst({
    where: { id: modId, status: "PUBLISHED" },
    select: { id: true, slug: true, title: true, authorId: true },
  });
}

/** Prvá chyba zod → kód + parametre dĺžky pre lokalizovanú správu. */
function lengthError(attempt: number, fieldName: string, code: "BODY_LENGTH" | "TITLE_LENGTH", min: number, max: number): FormState {
  return failure(attempt, "GENERIC", { fieldErrors: { [fieldName]: code }, errorParams: { min: String(min), max: String(max) } });
}

// ───────────────────────────── Recenzie ─────────────────────────────

const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  body: z.string().trim().min(20).max(5000),
});

export async function upsertReviewAction(state: FormState, formData: FormData): Promise<FormState> {
  return keepValues(await upsertReviewInner(state, formData), formData, ["rating", "body"]);
}

async function upsertReviewInner(state: FormState, formData: FormData): Promise<FormState> {
  const attempt = previousAttempt(state);
  const who = await actor(attempt);
  if ("error" in who) return who.error;
  const { user } = who;

  const mod = await publicMod(formData.get("modId"));
  if (!mod) return failure(attempt, "MOD_NOT_FOUND");
  if (mod.authorId === user.id) return failure(attempt, "REVIEW_OWN_MOD");

  const parsed = reviewSchema.safeParse({ rating: field(formData, "rating"), body: field(formData, "body") ?? "" });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.path[0] === "rating") return failure(attempt, "GENERIC", { fieldErrors: { rating: "RATING_INVALID" } });
    return lengthError(attempt, "body", "BODY_LENGTH", 20, 5000);
  }

  const ctx = await requestContext();
  const blocked = await guardForm({ ctx, attempt, requireTurnstile: false, limits: [[RATE_LIMITS.communityPost, user.id]], auditActorId: user.id });
  if (blocked) return blocked;

  const currentVersion = await db().mod.findUnique({ where: { id: mod.id }, select: { currentVersionId: true } });
  const existing = await db().review.findUnique({ where: { modId_userId: { modId: mod.id, userId: user.id } }, select: { id: true } });

  await db().$transaction(async (tx) => {
    await tx.review.upsert({
      where: { modId_userId: { modId: mod.id, userId: user.id } },
      create: {
        modId: mod.id,
        userId: user.id,
        rating: parsed.data.rating,
        body: parsed.data.body,
        bodyHtml: renderMarkdown(parsed.data.body),
        versionId: currentVersion?.currentVersionId ?? null,
      },
      update: {
        rating: parsed.data.rating,
        body: parsed.data.body,
        bodyHtml: renderMarkdown(parsed.data.body),
        versionId: currentVersion?.currentVersionId ?? null,
      },
    });
    const aggregate = await tx.review.aggregate({
      where: { modId: mod.id, hiddenAt: null },
      _avg: { rating: true },
      _count: { _all: true },
    });
    await tx.mod.update({
      where: { id: mod.id },
      data: { ratingAvg: aggregate._avg.rating ?? 0, ratingCount: aggregate._count._all },
    });
  });

  if (!existing) {
    await notify({
      userId: mod.authorId,
      type: "REVIEW_NEW",
      modId: mod.id,
      link: `/mod/${mod.slug}#recenzie`,
      data: { modTitle: mod.title, rating: parsed.data.rating, by: user.username },
    });
  }
  revalidatePath(`/mod/${mod.slug}`);
  return { status: "success", attempt: attempt + 1 };
}

// ───────────────────────────── Hlásenia chýb ─────────────────────────────

const bugSchema = z.object({
  title: z.string().trim().min(5).max(120),
  description: z.string().trim().min(20).max(5000),
  logfile: z.string().max(LOGFILE_MAX).optional(),
  omsiVersion: z.string().trim().max(20).optional(),
  versionId: z.string().regex(/^[a-z0-9]{10,40}$/).optional(),
});

export async function createBugReportAction(state: FormState, formData: FormData): Promise<FormState> {
  const attempt = previousAttempt(state);
  const who = await actor(attempt);
  if ("error" in who) return who.error;
  const { user } = who;

  const mod = await publicMod(formData.get("modId"));
  if (!mod) return failure(attempt, "MOD_NOT_FOUND");

  const raw = {
    title: field(formData, "title") ?? "",
    description: field(formData, "description") ?? "",
    logfile: field(formData, "logfile") || undefined,
    omsiVersion: field(formData, "omsiVersion") || undefined,
    versionId: field(formData, "versionId") || undefined,
  };
  const values = { title: raw.title, omsiVersion: raw.omsiVersion ?? "" };
  if ((raw.logfile?.length ?? 0) > LOGFILE_MAX) return failure(attempt, "GENERIC", { fieldErrors: { logfile: "LOGFILE_TOO_LONG" }, values });
  const parsed = bugSchema.safeParse(raw);
  if (!parsed.success) {
    const path = String(parsed.error.issues[0]?.path[0] ?? "");
    if (path === "title") return { ...lengthError(attempt, "title", "TITLE_LENGTH", 5, 120), values };
    return { ...lengthError(attempt, "description", "BODY_LENGTH", 20, 5000), values };
  }

  const ctx = await requestContext();
  const blocked = await guardForm({ ctx, attempt, requireTurnstile: false, limits: [[RATE_LIMITS.communityPost, user.id]], auditActorId: user.id });
  if (blocked) return blocked;

  const version = parsed.data.versionId
    ? await db().modVersion.findFirst({ where: { id: parsed.data.versionId, modId: mod.id, status: "PUBLISHED" }, select: { id: true } })
    : null;

  const report = await db().bugReport.create({
    data: {
      modId: mod.id,
      reporterId: user.id,
      versionId: version?.id ?? null,
      title: parsed.data.title,
      description: parsed.data.description,
      descriptionHtml: renderMarkdown(parsed.data.description),
      // Log sa ukladá ako čistý text a zobrazuje v <pre> – nikdy sa neinterpretuje
      logfile: parsed.data.logfile?.replace(/\r\n?/g, "\n").replace(/\u0000/g, "") ?? null,
      omsiVersion: parsed.data.omsiVersion ?? null,
    },
  });
  if (mod.authorId !== user.id) {
    await notify({
      userId: mod.authorId,
      type: "BUG_REPORT_NEW",
      modId: mod.id,
      link: `/mod/${mod.slug}/chyby/${report.id}`,
      data: { modTitle: mod.title, title: report.title, by: user.username },
    });
  }
  revalidatePath(`/mod/${mod.slug}`);
  redirect(`/mod/${mod.slug}/chyby/${report.id}`);
}

async function bugWithAccess(bugId: unknown) {
  if (typeof bugId !== "string" || !/^[a-z0-9]{10,40}$/.test(bugId)) return null;
  return db().bugReport.findUnique({
    where: { id: bugId },
    select: {
      id: true,
      title: true,
      reporterId: true,
      mod: { select: { id: true, slug: true, title: true, status: true, authorId: true } },
    },
  });
}

const commentSchema = z.string().trim().min(2).max(5000);

export async function addBugCommentAction(state: FormState, formData: FormData): Promise<FormState> {
  const attempt = previousAttempt(state);
  const who = await actor(attempt);
  if ("error" in who) return who.error;
  const { user } = who;

  const bug = await bugWithAccess(formData.get("bugId"));
  if (!bug || bug.mod.status !== "PUBLISHED") return failure(attempt, "MOD_NOT_FOUND");
  const parsed = commentSchema.safeParse(field(formData, "body") ?? "");
  if (!parsed.success) return lengthError(attempt, "body", "BODY_LENGTH", 2, 5000);

  const ctx = await requestContext();
  const blocked = await guardForm({ ctx, attempt, requireTurnstile: false, limits: [[RATE_LIMITS.communityPost, user.id]], auditActorId: user.id });
  if (blocked) return blocked;

  await db().bugReportComment.create({
    data: { bugReportId: bug.id, userId: user.id, body: parsed.data, bodyHtml: renderMarkdown(parsed.data) },
  });
  const recipients = [bug.reporterId, bug.mod.authorId].filter((id) => id !== user.id);
  await notify(
    [...new Set(recipients)].map((userId) => ({
      userId,
      type: "COMMENT_REPLY" as const,
      modId: bug.mod.id,
      link: `/mod/${bug.mod.slug}/chyby/${bug.id}`,
      data: { modTitle: bug.mod.title, title: bug.title, by: user.username },
    })),
  );
  revalidatePath(`/mod/${bug.mod.slug}/chyby/${bug.id}`);
  return { status: "success", attempt: attempt + 1 };
}

const statusSchema = z.object({
  status: z.enum(["OPEN", "CONFIRMED", "IN_PROGRESS", "FIXED", "WONT_FIX", "DUPLICATE", "INVALID"]),
  fixedInVersion: z.string().trim().max(30).optional(),
});

/** Zmena stavu hlásenia – autor modu alebo moderátor. */
export async function updateBugStatusAction(state: FormState, formData: FormData): Promise<FormState> {
  const attempt = previousAttempt(state);
  const who = await actor(attempt);
  if ("error" in who) return who.error;
  const { user } = who;

  const bug = await bugWithAccess(formData.get("bugId"));
  if (!bug) return failure(attempt, "MOD_NOT_FOUND");
  if (bug.mod.authorId !== user.id && !can(user.role, "moderation:decide")) return failure(attempt, "FORBIDDEN");
  const parsed = statusSchema.safeParse({ status: field(formData, "status"), fixedInVersion: field(formData, "fixedInVersion") || undefined });
  if (!parsed.success) return failure(attempt, "GENERIC");

  await db().bugReport.update({
    where: { id: bug.id },
    data: { status: parsed.data.status, fixedInVersion: parsed.data.status === "FIXED" ? (parsed.data.fixedInVersion ?? null) : null },
  });
  if (bug.reporterId !== user.id) {
    await notify({
      userId: bug.reporterId,
      type: "BUG_REPORT_STATUS",
      modId: bug.mod.id,
      link: `/mod/${bug.mod.slug}/chyby/${bug.id}`,
      data: { modTitle: bug.mod.title, title: bug.title, status: parsed.data.status },
    });
  }
  revalidatePath(`/mod/${bug.mod.slug}/chyby/${bug.id}`);
  revalidatePath(`/mod/${bug.mod.slug}`);
  return { status: "success", attempt: attempt + 1 };
}

// ───────────────────────────── Nahlásenia ─────────────────────────────

const reportSchema = z.object({
  reason: z.enum(["STOLEN_CONTENT", "MISSING_CREDITS", "UNAUTHORIZED_REUPLOAD", "BROKEN_ARCHIVE", "SUSPICIOUS_FILE", "SPAM", "OFFENSIVE", "OTHER"]),
  details: z.string().trim().min(10).max(2000),
  fileId: z.string().regex(/^[a-z0-9]{10,40}$/).optional(),
  reviewId: z.string().regex(/^[a-z0-9]{10,40}$/).optional(),
  commentId: z.string().regex(/^[a-z0-9]{10,40}$/).optional(),
});

/** „Nahlásiť“ – kradnutý model, chýbajúce kredity, reupload, poškodený alebo podozrivý súbor. */
export async function createReportAction(state: FormState, formData: FormData): Promise<FormState> {
  return keepValues(await createReportInner(state, formData), formData, ["reason", "details", "fileId"]);
}

async function createReportInner(state: FormState, formData: FormData): Promise<FormState> {
  const attempt = previousAttempt(state);
  const who = await actor(attempt);
  if ("error" in who) return who.error;
  const { user } = who;

  const modId = formData.get("modId");
  const mod =
    typeof modId === "string" && /^[a-z0-9]{10,40}$/.test(modId)
      ? await db().mod.findFirst({ where: { id: modId, status: { in: ["PUBLISHED", "PLANNED", "SCHEDULED"] } }, select: { id: true, slug: true, title: true } })
      : null;
  if (!mod) return failure(attempt, "MOD_NOT_FOUND");

  const parsed = reportSchema.safeParse({
    reason: field(formData, "reason"),
    details: field(formData, "details") ?? "",
    fileId: field(formData, "fileId") || undefined,
    reviewId: field(formData, "reviewId") || undefined,
    commentId: field(formData, "commentId") || undefined,
  });
  if (!parsed.success) {
    const path = String(parsed.error.issues[0]?.path[0] ?? "");
    if (path === "details") return lengthError(attempt, "details", "BODY_LENGTH", 10, 2000);
    return failure(attempt, "GENERIC");
  }

  const ctx = await requestContext();
  const blocked = await guardForm({ ctx, attempt, requireTurnstile: false, limits: [[RATE_LIMITS.reportSubmit, user.id]], auditActorId: user.id });
  if (blocked) return blocked;

  // Recenzia a komentár musia patriť k tomuto modu (komentár je v diskusii pod jeho devlogom); vlastný príspevok sa nenahlasuje
  const review = parsed.data.reviewId
    ? await db().review.findFirst({ where: { id: parsed.data.reviewId, modId: mod.id, hiddenAt: null }, select: { id: true, userId: true } })
    : null;
  const comment = parsed.data.commentId
    ? await db().comment.findFirst({
        where: { id: parsed.data.commentId, hiddenAt: null, OR: [{ modId: mod.id }, { devlog: { modId: mod.id } }] },
        select: { id: true, userId: true },
      })
    : null;
  if ((parsed.data.reviewId && !review) || (parsed.data.commentId && !comment)) return failure(attempt, "MOD_NOT_FOUND");
  if (review?.userId === user.id || comment?.userId === user.id) return failure(attempt, "FORBIDDEN");

  const duplicate = await db().report.findFirst({
    where: { reporterId: user.id, modId: mod.id, reviewId: review?.id ?? null, commentId: comment?.id ?? null, status: "OPEN" },
    select: { id: true },
  });
  if (duplicate) return failure(attempt, "REPORT_DUPLICATE");
  const file = parsed.data.fileId && !review && !comment
    ? await db().modFile.findFirst({ where: { id: parsed.data.fileId, modId: mod.id }, select: { id: true } })
    : null;

  const report = await db().report.create({
    data: {
      reporterId: user.id,
      targetType: review ? "REVIEW" : comment ? "COMMENT" : file ? "FILE" : "MOD",
      modId: mod.id,
      fileId: file?.id ?? null,
      reviewId: review?.id ?? null,
      commentId: comment?.id ?? null,
      reason: parsed.data.reason,
      details: parsed.data.details,
    },
  });
  await audit({ action: "report.created", actorId: user.id, targetType: "report", targetId: report.id, metadata: { modId: mod.id, reason: report.reason, target: report.targetType }, headers: ctx.headers });

  // Moderátori sa o nahlásení dozvedia hneď (zvonček + súhrnný email podľa ich nastavení)
  const moderators = await db().user.findMany({
    where: { role: { in: ["MODERATOR", "ADMIN"] }, bannedAt: null, id: { not: user.id } },
    select: { id: true },
  });
  await notify(moderators.map((m) => ({ userId: m.id, type: "REPORT_NEW" as const, modId: mod.id, link: "/admin/nahlasenia", data: { modTitle: mod.title, reason: report.reason } })));
  return { status: "success", attempt: attempt + 1 };
}
