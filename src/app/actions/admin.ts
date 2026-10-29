"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { CATEGORY_ICONS } from "@/lib/category-icons";
import { FIELD_KEY_PATTERN, FIELD_TYPES, FILTERABLE_TYPES, parseOptionLines, type FieldOption } from "@/lib/category-fields";
import { canAssignRole, canBan, canManageOwned, type AppRole, type Permission } from "@/lib/rbac";
import { safeRedirectPath } from "@/lib/validation/auth";
import { field } from "@/server/action-guard";
import { approve, decideFile, reject, requestChanges } from "@/server/admin/moderation";
import { audit } from "@/server/audit";
import { notify } from "@/server/notifications";
import { AccessDeniedError, requirePermission, type CurrentUser } from "@/server/session";
import { saveSettings } from "@/server/settings";

/**
 * Admin akcie sú obyčajné formuláre: po spracovaní sa presmeruje späť s ?ok=1 alebo ?chyba=KÓD,
 * takže fungujú aj bez JavaScriptu. Oprávnenie sa overuje v každej akcii znova.
 */
async function guard(permission: Permission): Promise<CurrentUser> {
  try {
    return await requirePermission(permission);
  } catch (error) {
    if (error instanceof AccessDeniedError) redirect("/prihlasenie?next=/admin");
    throw error;
  }
}

function back(formData: FormData, fallback: string, outcome: { ok: true } | { ok: false; error: string }): never {
  const target = safeRedirectPath(field(formData, "back"), fallback);
  const separator = target.includes("?") ? "&" : "?";
  redirect(`${target}${separator}${outcome.ok ? "ok=1" : `chyba=${outcome.error}`}`);
}

const id = z.string().regex(/^[a-z0-9]{10,40}$/);

/** Skrytie obsahu: moderátor nesmie skryť obsah používateľa s vyššou rolou (napr. administrátora). */
function canHideModOf(actor: CurrentUser, author: { id: string; role: string }): boolean {
  return canManageOwned(actor, { id: author.id, role: author.role as Exclude<AppRole, "GUEST"> }, "content:hide", "content:hide");
}

// ───────────────────────────── Moderácia ─────────────────────────────

export async function moderateModAction(formData: FormData): Promise<void> {
  const actor = await guard("moderation:decide");
  const modId = field(formData, "modId") ?? "";
  const decision = field(formData, "decision");
  const comment = (field(formData, "comment") ?? "").trim().slice(0, 2000);
  if (!id.safeParse(modId).success) back(formData, "/admin/fronta", { ok: false, error: "MOD_NOT_FOUND" });

  const result =
    decision === "approve" ? await approve(actor, modId, comment)
    : decision === "changes" ? await requestChanges(actor, modId, comment)
    : decision === "reject" ? await reject(actor, modId, comment)
    : ({ ok: false, error: "GENERIC" } as const);
  revalidatePath("/admin", "layout");
  revalidatePath("/", "layout");
  back(formData, `/admin/fronta/${modId}`, result);
}

export async function moderateFileAction(formData: FormData): Promise<void> {
  const actor = await guard("file:approve-inspection");
  const fileId = field(formData, "fileId") ?? "";
  const allow = field(formData, "decision") === "allow";
  const comment = (field(formData, "comment") ?? "").trim().slice(0, 2000);
  const result = id.safeParse(fileId).success ? await decideFile(actor, fileId, allow, comment) : ({ ok: false, error: "MOD_NOT_FOUND" } as const);
  revalidatePath("/admin", "layout");
  revalidatePath("/", "layout");
  back(formData, "/admin/fronta", result);
}

// ───────────────────────────── Nahlásenia ─────────────────────────────

export async function resolveReportAction(formData: FormData): Promise<void> {
  const actor = await guard("report:resolve");
  const reportId = field(formData, "reportId") ?? "";
  const status = field(formData, "status") === "DISMISSED" ? "DISMISSED" : "RESOLVED";
  const note = (field(formData, "note") ?? "").trim().slice(0, 1000);
  const report = id.safeParse(reportId).success
    ? await db().report.findUnique({ where: { id: reportId }, select: { id: true, status: true, reporterId: true, modId: true, reviewId: true, commentId: true, mod: { select: { title: true, slug: true, author: { select: { id: true, role: true } } } } } })
    : null;
  if (!report || report.status !== "OPEN") back(formData, "/admin/nahlasenia", { ok: false, error: "NOTHING_PENDING" });

  if (formData.get("hideMod") === "on" && report.modId && report.mod && !canHideModOf(actor, report.mod.author)) {
    back(formData, "/admin/nahlasenia", { ok: false, error: "FORBIDDEN" });
  }

  await db().report.update({ where: { id: report.id }, data: { status, resolutionNote: note || null, resolvedById: actor.id, resolvedAt: new Date() } });
  if (formData.get("hideMod") === "on" && report.modId) {
    await db().mod.update({ where: { id: report.modId }, data: { status: "HIDDEN" } });
    await audit({ action: "mod.hidden", actorId: actor.id, targetType: "mod", targetId: report.modId, metadata: { reportId: report.id } });
  }
  if (formData.get("hideReview") === "on" && report.reviewId) {
    const review = await db().review.update({ where: { id: report.reviewId }, data: { hiddenAt: new Date() }, select: { modId: true } });
    const aggregate = await db().review.aggregate({ where: { modId: review.modId, hiddenAt: null }, _avg: { rating: true }, _count: { _all: true } });
    await db().mod.update({ where: { id: review.modId }, data: { ratingAvg: aggregate._avg.rating ?? 0, ratingCount: aggregate._count._all } });
    await audit({ action: "review.hidden", actorId: actor.id, targetType: "review", targetId: report.reviewId });
  }
  if (formData.get("hideComment") === "on" && report.commentId) {
    await db().comment.update({ where: { id: report.commentId }, data: { hiddenAt: new Date() } });
    await audit({ action: "comment.hidden", actorId: actor.id, targetType: "comment", targetId: report.commentId });
  }
  await notify({ userId: report.reporterId, type: "REPORT_RESOLVED", modId: report.modId, link: report.mod ? `/mod/${report.mod.slug}` : null, data: { modTitle: report.mod?.title ?? "" } });
  await audit({ action: status === "RESOLVED" ? "report.resolved" : "report.dismissed", actorId: actor.id, targetType: "report", targetId: report.id, metadata: { note } });
  revalidatePath("/admin", "layout");
  back(formData, "/admin/nahlasenia", { ok: true });
}

// ───────────────────────────── Modifikácie ─────────────────────────────

export async function featureModAction(formData: FormData): Promise<void> {
  const actor = await guard("mod:feature");
  const modId = field(formData, "modId") ?? "";
  const featured = field(formData, "featured") === "1";
  const untilRaw = field(formData, "until");
  const until = untilRaw && /^\d{4}-\d{2}-\d{2}$/.test(untilRaw) ? new Date(`${untilRaw}T23:59:59Z`) : null;
  if (!id.safeParse(modId).success) back(formData, "/admin/mody", { ok: false, error: "MOD_NOT_FOUND" });
  await db().mod.update({ where: { id: modId }, data: { isFeatured: featured, featuredUntil: featured ? until : null } });
  await audit({ action: "mod.featured", actorId: actor.id, targetType: "mod", targetId: modId, metadata: { featured, until: until?.toISOString() ?? null } });
  revalidatePath("/");
  back(formData, "/admin/mody", { ok: true });
}

export async function setModVisibilityAction(formData: FormData): Promise<void> {
  const actor = await guard("content:hide");
  const modId = field(formData, "modId") ?? "";
  const visibility = field(formData, "visibility");
  const mod = id.safeParse(modId).success
    ? await db().mod.findUnique({ where: { id: modId }, select: {
          id: true,
          slug: true,
          status: true,
          currentVersionId: true,
          author: { select: { id: true, role: true } },
          plannedRelease: { select: { id: true } },
          versions: { where: { status: "SCHEDULED" }, select: { id: true }, take: 1 },
        },
      })
    : null;
  if (!mod) back(formData, "/admin/mody", { ok: false, error: "MOD_NOT_FOUND" });
  if (!canHideModOf(actor, mod.author)) back(formData, "/admin/mody", { ok: false, error: "FORBIDDEN" });

  const status =
    visibility === "hide" ? "HIDDEN"
    : visibility === "remove" ? "REMOVED"
    : mod.currentVersionId ? "PUBLISHED"
    // Schválené vydanie s odpočítavaním musí po obnovení ostať naplánované, inak by sa nikdy neodomklo
    : mod.versions.length > 0 ? "SCHEDULED"
    : mod.plannedRelease ? "PLANNED"
    : "DRAFT";
  await db().mod.update({ where: { id: mod.id }, data: { status } });
  await audit({ action: status === "HIDDEN" || status === "REMOVED" ? (status === "HIDDEN" ? "mod.hidden" : "mod.removed") : "mod.published", actorId: actor.id, targetType: "mod", targetId: mod.id, metadata: { status } });
  revalidatePath(`/mod/${mod.slug}`);
  revalidatePath("/");
  back(formData, "/admin/mody", { ok: true });
}

// ───────────────────────────── Používatelia ─────────────────────────────

const ROLE_VALUES = ["USER", "VERIFIED_CREATOR", "MODERATOR", "ADMIN"] as const;

export async function setUserRoleAction(formData: FormData): Promise<void> {
  const actor = await guard("user:change-role");
  const userId = field(formData, "userId") ?? "";
  const role = field(formData, "role") as (typeof ROLE_VALUES)[number] | undefined;
  const target = id.safeParse(userId).success ? await db().user.findUnique({ where: { id: userId }, select: { id: true, role: true } }) : null;
  if (!target || !role || !ROLE_VALUES.includes(role) || !canAssignRole(actor, target.id, target.role as Exclude<AppRole, "GUEST">, role)) {
    back(formData, "/admin/pouzivatelia", { ok: false, error: "ROLE_NOT_ALLOWED" });
  }
  await db().user.update({ where: { id: target.id }, data: { role } });
  await audit({ action: "user.role_changed", actorId: actor.id, targetType: "user", targetId: target.id, metadata: { from: target.role, to: role } });
  back(formData, "/admin/pouzivatelia", { ok: true });
}

export async function banUserAction(formData: FormData): Promise<void> {
  const actor = await guard("user:ban");
  const userId = field(formData, "userId") ?? "";
  const unban = field(formData, "unban") === "1";
  const target = id.safeParse(userId).success ? await db().user.findUnique({ where: { id: userId }, select: { id: true, role: true } }) : null;
  if (!target || !canBan(actor, { id: target.id, role: target.role as Exclude<AppRole, "GUEST"> })) {
    back(formData, "/admin/pouzivatelia", { ok: false, error: "BAN_NOT_ALLOWED" });
  }
  if (unban) {
    await db().user.update({ where: { id: target.id }, data: { bannedAt: null, bannedUntil: null, banReason: null } });
    await audit({ action: "user.unbanned", actorId: actor.id, targetType: "user", targetId: target.id });
  } else {
    const reason = (field(formData, "reason") ?? "").trim().slice(0, 500);
    const days = Number(field(formData, "days") ?? "");
    const until = Number.isInteger(days) && days > 0 && days <= 3650 ? new Date(Date.now() + days * 86_400_000) : null;
    await db().$transaction([
      db().user.update({ where: { id: target.id }, data: { bannedAt: new Date(), bannedUntil: until, banReason: reason || null } }),
      // Ban okamžite odhlási zo všetkých zariadení
      db().session.deleteMany({ where: { userId: target.id } }),
    ]);
    await audit({ action: "user.banned", actorId: actor.id, targetType: "user", targetId: target.id, metadata: { reason, until: until?.toISOString() ?? null } });
  }
  back(formData, "/admin/pouzivatelia", { ok: true });
}

// ───────────────────────────── Kategórie ─────────────────────────────

const categorySchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{2,40}$/),
  nameSk: z.string().trim().min(2).max(60),
  nameCs: z.string().trim().min(2).max(60),
  descriptionSk: z.string().trim().max(300),
  descriptionCs: z.string().trim().max(300),
  icon: z.enum(Object.keys(CATEGORY_ICONS) as [string, ...string[]]),
  sortOrder: z.coerce.number().int().min(0).max(999),
  isActive: z.boolean(),
});

export async function saveCategoryAction(formData: FormData): Promise<void> {
  const actor = await guard("category:manage");
  const categoryId = field(formData, "categoryId");
  const parsed = categorySchema.safeParse({
    slug: field(formData, "slug"),
    nameSk: field(formData, "nameSk"),
    nameCs: field(formData, "nameCs"),
    descriptionSk: field(formData, "descriptionSk") ?? "",
    descriptionCs: field(formData, "descriptionCs") ?? "",
    icon: field(formData, "icon"),
    sortOrder: field(formData, "sortOrder") ?? "0",
    isActive: formData.get("isActive") === "on",
  });
  if (!parsed.success) back(formData, "/admin/kategorie", { ok: false, error: "GENERIC" });
  const clash = await db().category.findFirst({ where: { slug: parsed.data.slug, ...(categoryId ? { id: { not: categoryId } } : {}) }, select: { id: true } });
  if (clash) back(formData, "/admin/kategorie", { ok: false, error: "SLUG_TAKEN" });

  if (categoryId && id.safeParse(categoryId).success) {
    await db().category.update({ where: { id: categoryId }, data: parsed.data });
    await audit({ action: "category.updated", actorId: actor.id, targetType: "category", targetId: categoryId, metadata: { slug: parsed.data.slug } });
  } else {
    const created = await db().category.create({ data: parsed.data });
    await audit({ action: "category.created", actorId: actor.id, targetType: "category", targetId: created.id, metadata: { slug: parsed.data.slug } });
  }
  revalidatePath("/", "layout");
  back(formData, "/admin/kategorie", { ok: true });
}

// ───────────────────────────── Parametre kategórií ─────────────────────────────

const fieldSchema = z.object({
  labelSk: z.string().trim().min(1).max(60),
  labelCs: z.string().trim().min(1).max(60),
  hintSk: z.string().trim().max(160),
  hintCs: z.string().trim().max(160),
  unit: z.string().trim().max(12),
  sortOrder: z.coerce.number().int().min(0).max(999),
});

/** Vytvorenie alebo úprava vlastného poľa kategórie. Kľúč a typ sa po vytvorení nemenia (hodnoty pri modoch). */
export async function saveCategoryFieldAction(formData: FormData): Promise<void> {
  const actor = await guard("category:manage");
  const categoryId = field(formData, "categoryId") ?? "";
  const fieldId = field(formData, "fieldId");
  const backTo = `/admin/kategorie/${categoryId}`;
  const category = id.safeParse(categoryId).success ? await db().category.findUnique({ where: { id: categoryId }, select: { id: true } }) : null;
  if (!category) back(formData, "/admin/kategorie", { ok: false, error: "GENERIC" });

  const existing = fieldId && id.safeParse(fieldId).success
    ? await db().categoryField.findFirst({ where: { id: fieldId, categoryId }, select: { id: true, key: true, type: true } })
    : null;
  if (fieldId && !existing) back(formData, backTo, { ok: false, error: "GENERIC" });

  const parsed = fieldSchema.safeParse({
    labelSk: field(formData, "labelSk") ?? "",
    labelCs: field(formData, "labelCs") ?? "",
    hintSk: field(formData, "hintSk") ?? "",
    hintCs: field(formData, "hintCs") ?? "",
    unit: field(formData, "unit") ?? "",
    sortOrder: field(formData, "sortOrder") ?? "0",
  });
  if (!parsed.success) back(formData, backTo, { ok: false, error: "GENERIC" });

  const typeRaw = field(formData, "type");
  const type = existing?.type ?? FIELD_TYPES.find((x) => x === typeRaw);
  if (!type) back(formData, backTo, { ok: false, error: "GENERIC" });
  const key = existing?.key ?? (field(formData, "key") ?? "").trim();
  if (!FIELD_KEY_PATTERN.test(key)) back(formData, backTo, { ok: false, error: "FIELD_KEY_INVALID" });

  let options: FieldOption[] = [];
  if (type === "SELECT" || type === "MULTISELECT") {
    const result = parseOptionLines(field(formData, "options") ?? "");
    if ("error" in result || result.options.length === 0) back(formData, backTo, { ok: false, error: "OPTIONS_INVALID" });
    options = result.options;
  }

  const data = {
    ...parsed.data,
    options,
    required: type !== "BOOLEAN" && formData.get("required") === "on",
    filterable: FILTERABLE_TYPES.includes(type) && formData.get("filterable") === "on",
    isActive: formData.get("isActive") === "on",
  };
  if (existing) {
    await db().categoryField.update({ where: { id: existing.id }, data });
  } else {
    const clash = await db().categoryField.findUnique({ where: { categoryId_key: { categoryId, key } }, select: { id: true } });
    if (clash) back(formData, backTo, { ok: false, error: "FIELD_KEY_TAKEN" });
    await db().categoryField.create({ data: { ...data, categoryId, key, type } });
  }
  await audit({ action: "category.updated", actorId: actor.id, targetType: "category", targetId: categoryId, metadata: { field: key, type } });
  revalidatePath("/", "layout");
  back(formData, backTo, { ok: true });
}

// ───────────────────────────── Nastavenia ─────────────────────────────

export async function saveSettingsAction(formData: FormData): Promise<void> {
  const actor = await guard("settings:manage");
  const gb = Number(field(formData, "maxFileGb") ?? "");
  const active = Number(field(formData, "maxActive") ?? "");
  if (!Number.isFinite(gb) || gb <= 0 || !Number.isInteger(active) || active < 1 || active > 20) {
    back(formData, "/admin/nastavenia", { ok: false, error: "GENERIC" });
  }
  await saveSettings(actor.id, {
    uploadsEnabled: formData.get("uploadsEnabled") === "on",
    registrationEnabled: formData.get("registrationEnabled") === "on",
    maxFileBytes: Math.round(gb * 1024 ** 3),
    maxActiveUploads: active,
  });
  back(formData, "/admin/nastavenia", { ok: true });
}
