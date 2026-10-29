"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import type { FormState } from "@/lib/form-state";
import { can } from "@/lib/rbac";
import { failure, field, guardForm, previousAttempt, requestContext } from "@/server/action-guard";
import { renderMarkdown } from "@/server/markdown";
import { PUBLIC_MOD_STATUSES } from "@/server/mods/access";
import { loadEditableMod } from "@/server/mods/wizard";
import { notify, notifyFollowers } from "@/server/notifications";
import { RATE_LIMITS } from "@/server/security/rate-limit";
import { AccessDeniedError, requireUser, type CurrentUser } from "@/server/session";
import { storage } from "@/server/storage";

const id = z.string().regex(/^[a-z0-9]{10,40}$/);

async function verifiedUser(attempt: number): Promise<{ user: CurrentUser } | { error: FormState }> {
  try {
    const user = await requireUser();
    if (!user.emailVerified) return { error: failure(attempt, "EMAIL_NOT_VERIFIED") };
    return { user };
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: failure(attempt, error.code) };
    throw error;
  }
}

const devlogSchema = z.object({
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(10).max(20_000),
  imageIds: z.array(id).max(6),
});

/** Nový devlog – sledujúcim projektu príde upozornenie (web + email podľa nastavenia). */
export async function createDevlogAction(state: FormState, formData: FormData): Promise<FormState> {
  const attempt = previousAttempt(state);
  const who = await verifiedUser(attempt);
  if ("error" in who) return who.error;
  const { user } = who;
  const mod = await loadEditableMod(user, field(formData, "modId") ?? "");
  if (!mod) return failure(attempt, "MOD_NOT_FOUND");
  if (!PUBLIC_MOD_STATUSES.includes(mod.status)) return failure(attempt, "NOT_PLANNED");

  const values = { title: field(formData, "title") ?? "", body: field(formData, "body") ?? "" };
  const parsed = devlogSchema.safeParse({ ...values, imageIds: formData.getAll("imageIds").filter((v) => typeof v === "string") });
  if (!parsed.success) {
    const path = String(parsed.error.issues[0]?.path[0] ?? "");
    if (path === "title") return failure(attempt, "GENERIC", { fieldErrors: { title: "TITLE_LENGTH" }, errorParams: { min: "3", max: "120" }, values });
    return failure(attempt, "GENERIC", { fieldErrors: { body: "BODY_LENGTH" }, errorParams: { min: "10", max: "20000" }, values });
  }

  const ctx = await requestContext();
  const blocked = await guardForm({ ctx, attempt, requireTurnstile: false, limits: [[RATE_LIMITS.communityPost, user.id]], auditActorId: user.id });
  if (blocked) return blocked;

  const devlog = await db().$transaction(async (tx) => {
    const created = await tx.devlog.create({
      data: {
        modId: mod.id,
        authorId: user.id,
        title: parsed.data.title,
        body: parsed.data.body,
        bodyHtml: renderMarkdown(parsed.data.body),
      },
    });
    // Priradiť sa dajú iba vlastné, zatiaľ nepriradené devlog fotky
    await tx.mediaImage.updateMany({
      where: { id: { in: parsed.data.imageIds }, ownerId: user.id, kind: "DEVLOG", modId: null, devlogId: null },
      data: { devlogId: created.id },
    });
    for (const [index, imageId] of parsed.data.imageIds.entries()) {
      await tx.mediaImage.updateMany({ where: { id: imageId, devlogId: created.id }, data: { sortOrder: index } });
    }
    return created;
  });

  await notifyFollowers({
    modId: mod.id,
    type: "DEVLOG_POSTED",
    link: `/mod/${mod.slug}#devlog-${devlog.id}`,
    data: { modTitle: mod.title, title: devlog.title },
    exceptUserId: user.id,
  });
  revalidatePath(`/mod/${mod.slug}`);
  revalidatePath(`/nahrat/${mod.id}/vydanie`);
  return { status: "success", attempt: attempt + 1 };
}

export async function deleteDevlogAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const devlogId = field(formData, "devlogId") ?? "";
  if (!id.safeParse(devlogId).success) return;
  const devlog = await db().devlog.findUnique({
    where: { id: devlogId },
    select: { id: true, authorId: true, mod: { select: { slug: true, id: true } }, images: { select: { storageKey: true, fullKey: true, storageDriver: true } } },
  });
  if (!devlog || (devlog.authorId !== user.id && !can(user.role, "content:hide"))) return;
  await db().devlog.delete({ where: { id: devlog.id } });
  await Promise.all(devlog.images.flatMap((i) => [storage(i.storageDriver).delete(i.storageKey), storage(i.storageDriver).delete(i.fullKey)]));
  revalidatePath(`/mod/${devlog.mod.slug}`);
  revalidatePath(`/nahrat/${devlog.mod.id}/vydanie`);
}

const commentSchema = z.string().trim().min(2).max(5000);

/** Diskusia pod devlogom. */
export async function addDevlogCommentAction(state: FormState, formData: FormData): Promise<FormState> {
  const attempt = previousAttempt(state);
  const who = await verifiedUser(attempt);
  if ("error" in who) return who.error;
  const { user } = who;

  const devlogId = field(formData, "devlogId") ?? "";
  const devlog = id.safeParse(devlogId).success
    ? await db().devlog.findUnique({
        where: { id: devlogId },
        select: { id: true, title: true, mod: { select: { id: true, slug: true, title: true, status: true, authorId: true } } },
      })
    : null;
  if (!devlog || !PUBLIC_MOD_STATUSES.includes(devlog.mod.status)) return failure(attempt, "MOD_NOT_FOUND");
  const body = commentSchema.safeParse(field(formData, "body") ?? "");
  if (!body.success) return failure(attempt, "GENERIC", { fieldErrors: { body: "BODY_LENGTH" }, errorParams: { min: "2", max: "5000" } });

  const ctx = await requestContext();
  const blocked = await guardForm({ ctx, attempt, requireTurnstile: false, limits: [[RATE_LIMITS.communityPost, user.id]], auditActorId: user.id });
  if (blocked) return blocked;

  await db().comment.create({ data: { devlogId: devlog.id, userId: user.id, body: body.data, bodyHtml: renderMarkdown(body.data) } });
  if (devlog.mod.authorId !== user.id) {
    await notify({
      userId: devlog.mod.authorId,
      type: "COMMENT_REPLY",
      modId: devlog.mod.id,
      link: `/mod/${devlog.mod.slug}#devlog-${devlog.id}`,
      data: { modTitle: devlog.mod.title, title: devlog.title, by: user.username },
    });
  }
  revalidatePath(`/mod/${devlog.mod.slug}`);
  return { status: "success", attempt: attempt + 1 };
}
