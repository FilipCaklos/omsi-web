"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import type { FormState } from "@/lib/form-state";
import { can } from "@/lib/rbac";
import { localDateTimeToUtc } from "@/lib/timezone";
import { failure, field, previousAttempt, requestContext } from "@/server/action-guard";
import { audit } from "@/server/audit";
import { checkVersionReadiness } from "@/server/mods/publish";
import { checkPlannedReadiness } from "@/server/mods/releases";
import { getWorkingVersion, loadEditableMod } from "@/server/mods/wizard";
import { AccessDeniedError, requireUser, type CurrentUser } from "@/server/session";

type Owner = { user: CurrentUser; mod: NonNullable<Awaited<ReturnType<typeof loadEditableMod>>> };

async function owner(attempt: number, modId: string | undefined): Promise<Owner | { error: FormState }> {
  let user: CurrentUser;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: failure(attempt, error.code) };
    throw error;
  }
  if (!user.emailVerified) return { error: failure(attempt, "EMAIL_NOT_VERIFIED") };
  const mod = await loadEditableMod(user, modId ?? "");
  if (!mod) return { error: failure(attempt, "MOD_NOT_FOUND") };
  return { user, mod };
}

function revalidate(modId: string, slug: string) {
  revalidatePath(`/nahrat/${modId}/vydanie`);
  revalidatePath(`/mod/${slug}`);
  revalidatePath("/pripravovane");
  revalidatePath("/");
}

const planSchema = z.object({
  mode: z.enum(["EXACT_DATE", "WINDOW", "TBA"]),
  releaseAt: z.string().optional(),
  windowYear: z.coerce.number().int().min(2024).max(2040).optional(),
  windowPart: z.enum(["Q1", "Q2", "Q3", "Q4", "SPRING", "SUMMER", "AUTUMN", "WINTER", "H1", "H2", "YEAR"]).optional(),
  noEtaQuestions: z.boolean(),
  progress: z.array(z.object({ label: z.string().trim().min(1).max(40), percent: z.number().int().min(0).max(100) })).max(12),
});

/** Uloží režim dátumu vydania a stav dokončenia po častiach. */
export async function savePlanAction(state: FormState, formData: FormData): Promise<FormState> {
  const attempt = previousAttempt(state);
  const ctx = await owner(attempt, field(formData, "modId"));
  if ("error" in ctx) return ctx.error;
  const { mod } = ctx;

  let progress: unknown;
  try {
    progress = JSON.parse(field(formData, "progress") ?? "[]");
  } catch {
    return failure(attempt, "PLAN_INVALID");
  }
  const parsed = planSchema.safeParse({
    mode: field(formData, "mode"),
    releaseAt: field(formData, "releaseAt") || undefined,
    windowYear: field(formData, "windowYear") || undefined,
    windowPart: field(formData, "windowPart") || undefined,
    noEtaQuestions: formData.get("noEtaQuestions") === "on",
    progress,
  });
  if (!parsed.success) return failure(attempt, "PLAN_INVALID");
  const plan = parsed.data;

  let releaseAt: Date | null = null;
  if (plan.mode === "EXACT_DATE") {
    releaseAt = plan.releaseAt ? localDateTimeToUtc(plan.releaseAt) : null;
    if (!releaseAt) return failure(attempt, "GENERIC", { fieldErrors: { releaseAt: "PLAN_INVALID" } });
    if (releaseAt.getTime() <= Date.now() + 60_000) return failure(attempt, "GENERIC", { fieldErrors: { releaseAt: "DATE_IN_PAST" } });
  }
  if (plan.mode === "WINDOW" && (!plan.windowYear || !plan.windowPart)) return failure(attempt, "PLAN_INVALID");

  const data = {
    mode: plan.mode,
    releaseAt,
    windowYear: plan.mode === "WINDOW" ? (plan.windowYear ?? null) : null,
    windowPart: plan.mode === "WINDOW" ? (plan.windowPart ?? null) : null,
    noEtaQuestions: plan.noEtaQuestions,
  };

  await db().$transaction(async (tx) => {
    const saved = await tx.plannedRelease.upsert({
      where: { modId: mod.id },
      create: { modId: mod.id, ...data },
      update: data,
      select: { id: true },
    });
    await tx.devProgress.deleteMany({ where: { plannedReleaseId: saved.id } });
    await tx.devProgress.createMany({
      data: plan.progress.map((p, i) => ({ plannedReleaseId: saved.id, label: p.label, percent: p.percent, sortOrder: i })),
    });

    // Naplánované vydanie nasleduje zmenu dátumu; bez presného dátumu sa plánovanie zruší
    if (mod.status === "SCHEDULED" || (await tx.modVersion.count({ where: { modId: mod.id, status: "SCHEDULED" } })) > 0) {
      if (releaseAt) {
        await tx.modVersion.updateMany({ where: { modId: mod.id, status: { in: ["SCHEDULED", "PENDING_REVIEW"] } }, data: { scheduledAt: releaseAt } });
      } else {
        await tx.modVersion.updateMany({ where: { modId: mod.id, status: "SCHEDULED" }, data: { status: "DRAFT", scheduledAt: null } });
        await tx.plannedRelease.update({ where: { modId: mod.id }, data: { autoPublish: false } });
        await tx.mod.updateMany({ where: { id: mod.id, status: "SCHEDULED" }, data: { status: "PLANNED" } });
      }
    }
  });
  revalidate(mod.id, mod.slug);
  return { status: "success", attempt: attempt + 1 };
}

/** Ohlásenie pripravovaného vydania (bez súborov) – objaví sa v /pripravovane. */
export async function announcePlannedAction(state: FormState, formData: FormData): Promise<FormState> {
  const attempt = previousAttempt(state);
  const ctx = await owner(attempt, field(formData, "modId"));
  if ("error" in ctx) return ctx.error;
  const { user, mod } = ctx;
  if (mod.currentVersionId !== null || !["DRAFT", "CHANGES_REQUESTED"].includes(mod.status)) return failure(attempt, "NOT_EDITABLE");

  const issues = await checkPlannedReadiness(mod.id);
  if (issues.length > 0) return failure(attempt, issues[0] ?? "PLAN_INVALID");

  const verified = can(user.role, "mod:publish-without-review");
  await db().mod.update({ where: { id: mod.id }, data: { status: verified ? "PLANNED" : "PENDING_REVIEW" } });
  const request = await requestContext();
  await audit({
    action: verified ? "mod.published" : "mod.submitted",
    actorId: user.id,
    targetType: "mod",
    targetId: mod.id,
    metadata: { planned: true },
    headers: request.headers,
  });
  revalidate(mod.id, mod.slug);
  return { status: "success", attempt: attempt + 1, values: { outcome: verified ? "announced" : "pending" } };
}

/** Naplánuje automatické vydanie súborov rozpracovanej verzie na presný dátum. */
export async function scheduleReleaseAction(state: FormState, formData: FormData): Promise<FormState> {
  const attempt = previousAttempt(state);
  const ctx = await owner(attempt, field(formData, "modId"));
  if ("error" in ctx) return ctx.error;
  const { user, mod } = ctx;

  const plan = await db().plannedRelease.findUnique({ where: { modId: mod.id }, select: { mode: true, releaseAt: true } });
  if (!plan) return failure(attempt, "NOT_PLANNED");
  if (plan.mode !== "EXACT_DATE" || !plan.releaseAt) return failure(attempt, "NOT_EXACT_DATE");
  if (plan.releaseAt.getTime() <= Date.now() + 60_000) return failure(attempt, "DATE_IN_PAST");

  const working = await getWorkingVersion(mod.id);
  if (!working) return failure(attempt, "NOT_EDITABLE");
  const issues = await checkVersionReadiness(mod.id, working.id);
  if (issues.length > 0) return failure(attempt, issues[0] ?? "GENERIC");

  const verified = can(user.role, "mod:publish-without-review");
  await db().$transaction([
    db().modVersion.update({
      where: { id: working.id },
      data: { status: verified ? "SCHEDULED" : "PENDING_REVIEW", scheduledAt: plan.releaseAt },
    }),
    db().plannedRelease.update({ where: { modId: mod.id }, data: { autoPublish: true } }),
    ...(verified
      ? [db().mod.update({ where: { id: mod.id }, data: { status: "SCHEDULED" } })]
      : mod.status === "DRAFT" || mod.status === "CHANGES_REQUESTED"
        ? [db().mod.update({ where: { id: mod.id }, data: { status: "PENDING_REVIEW" } })]
        : []),
  ]);
  await audit({ action: "mod.submitted", actorId: user.id, targetType: "mod", targetId: mod.id, metadata: { scheduledAt: plan.releaseAt.toISOString(), versionId: working.id } });
  revalidate(mod.id, mod.slug);
  return { status: "success", attempt: attempt + 1 };
}

/** Zrušenie naplánovaného vydania – verzia sa vráti do konceptu, projekt zostáva ohlásený. */
export async function cancelScheduleAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const mod = await loadEditableMod(user, field(formData, "modId") ?? "");
  if (!mod) return;
  await db().$transaction([
    db().modVersion.updateMany({ where: { modId: mod.id, status: "SCHEDULED" }, data: { status: "DRAFT", scheduledAt: null } }),
    db().plannedRelease.updateMany({ where: { modId: mod.id }, data: { autoPublish: false } }),
    db().mod.updateMany({ where: { id: mod.id, status: "SCHEDULED" }, data: { status: "PLANNED" } }),
  ]);
  revalidate(mod.id, mod.slug);
}
