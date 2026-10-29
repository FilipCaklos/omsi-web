"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import type { AuthErrorCode, FormState } from "@/lib/form-state";
import { failure, field, keepValues, previousAttempt, requestContext } from "@/server/action-guard";
import { audit } from "@/server/audit";
import { HttpError } from "@/server/http";
import { MARKDOWN_MAX_LENGTH, parseYoutubeId, renderMarkdown } from "@/server/markdown";
import { refreshSearchExtra, uniqueModSlug } from "@/server/mods/helpers";
import { submitVersion, type SubmitIssue } from "@/server/mods/publish";
import { VERSION_PATTERN, getWorkingVersion, loadEditableMod } from "@/server/mods/wizard";
import { getCategoryFields } from "@/server/mods/category-fields";
import { categoryFacets } from "@/server/mods/reference-data";
import { fieldInputName, parseAttributeForm } from "@/lib/category-fields";
import { parseLocation } from "@/lib/geo";
import { parseOpenOmsi } from "@/lib/open-omsi";
import { AccessDeniedError, requireUser, type CurrentUser } from "@/server/session";
import { storage } from "@/server/storage";
import { createModFileFromUpload } from "@/server/uploads/service";

const id = z.string().regex(/^[a-z0-9]{10,40}$/);

async function author(attempt: number): Promise<{ user: CurrentUser } | { error: FormState }> {
  try {
    const user = await requireUser();
    if (!user.emailVerified) return { error: failure(attempt, "EMAIL_NOT_VERIFIED") };
    return { user };
  } catch (error) {
    if (error instanceof AccessDeniedError) return { error: failure(attempt, error.code) };
    throw error;
  }
}

function invalid(attempt: number, field: string, code: AuthErrorCode, values?: Record<string, string>): FormState {
  return failure(attempt, "GENERIC", { fieldErrors: { [field]: code }, values });
}

function revalidateMod(modId: string, slug: string) {
  revalidatePath(`/nahrat/${modId}`);
  revalidatePath(`/mod/${slug}`);
}

// ───────────────────────────── Krok 1: Základ ─────────────────────────────

const basicsSchema = z.object({
  title: z.string().trim().min(3).max(100),
  categoryId: id,
  subcategoryId: id.optional(),
  summary: z.string().trim().min(20).max(200),
});

type Basics = z.infer<typeof basicsSchema>;

async function parseBasics(formData: FormData, attempt: number): Promise<{ error: FormState } | { data: Basics }> {
  const values = {
    title: field(formData, "title") ?? "",
    summary: field(formData, "summary") ?? "",
    categoryId: field(formData, "categoryId") ?? "",
    subcategoryId: field(formData, "subcategoryId") ?? "",
  };
  const parsed = basicsSchema.safeParse({ ...values, subcategoryId: values.subcategoryId || undefined });
  if (!parsed.success) {
    const path = String(parsed.error.issues[0]?.path[0] ?? "");
    if (path === "title") return { error: { ...invalid(attempt, "title", "TITLE_LENGTH", values), errorParams: { min: "3", max: "100" } } };
    if (path === "summary") return { error: invalid(attempt, "summary", "SUMMARY_LENGTH", values) };
    return { error: invalid(attempt, "categoryId", "CATEGORY_REQUIRED", values) };
  }
  const category = await db().category.findFirst({ where: { id: parsed.data.categoryId, isActive: true }, select: { id: true } });
  if (!category) return { error: invalid(attempt, "categoryId", "CATEGORY_REQUIRED", values) };
  if (parsed.data.subcategoryId) {
    const sub = await db().subcategory.findFirst({ where: { id: parsed.data.subcategoryId, categoryId: category.id }, select: { id: true } });
    if (!sub) return { error: invalid(attempt, "subcategoryId", "SUBCATEGORY_INVALID", values) };
  }
  return { data: parsed.data };
}

export async function createDraftAction(state: FormState, formData: FormData): Promise<FormState> {
  const attempt = previousAttempt(state);
  const who = await author(attempt);
  if ("error" in who) return who.error;
  const basics = await parseBasics(formData, attempt);
  if ("error" in basics) return basics.error;

  const ctx = await requestContext();
  const drafts = await db().mod.count({ where: { authorId: who.user.id, status: "DRAFT" } });
  if (drafts >= 20) return failure(attempt, "RATE_LIMITED", { errorParams: { minutes: "60" } });

  const mod = await db().mod.create({
    data: {
      slug: await uniqueModSlug(basics.data.title),
      title: basics.data.title,
      summary: basics.data.summary,
      categoryId: basics.data.categoryId,
      subcategoryId: basics.data.subcategoryId ?? null,
      authorId: who.user.id,
      status: "DRAFT",
      licenseTerms: ["NO_REUPLOAD", "MODIFY_WITH_PERMISSION"],
      versions: { create: { version: "1.0.0", status: "DRAFT" } },
      credits: { create: { name: who.user.name, role: "OTHER", userId: who.user.id, sortOrder: 0 } },
    },
    select: { id: true },
  });
  await refreshSearchExtra(mod.id);
  await audit({ action: "mod.created", actorId: who.user.id, targetType: "mod", targetId: mod.id, headers: ctx.headers });
  redirect(`/nahrat/${mod.id}?krok=popis`);
}

export async function saveBasicsAction(state: FormState, formData: FormData): Promise<FormState> {
  const attempt = previousAttempt(state);
  const who = await author(attempt);
  if ("error" in who) return who.error;
  const mod = await loadEditableMod(who.user, field(formData, "modId") ?? "");
  if (!mod) return failure(attempt, "MOD_NOT_FOUND");
  const basics = await parseBasics(formData, attempt);
  if ("error" in basics) return basics.error;

  await db().mod.update({
    where: { id: mod.id },
    data: {
      title: basics.data.title,
      summary: basics.data.summary,
      categoryId: basics.data.categoryId,
      subcategoryId: basics.data.subcategoryId ?? null,
      // URL sa po zverejnení nemení (odkazy z fór a Discordu musia fungovať)
      ...(mod.currentVersionId === null ? { slug: await uniqueModSlug(basics.data.title, mod.id) } : {}),
    },
  });
  await refreshSearchExtra(mod.id);
  revalidateMod(mod.id, mod.slug);
  redirect(`/nahrat/${mod.id}?krok=popis`);
}

// ───────────────────────────── Krok 2: Popis ─────────────────────────────

const detailsSchema = z.object({
  description: z.string().max(MARKDOWN_MAX_LENGTH),
  vehicleModel: z.string().trim().max(60),
  tags: z.array(z.string().min(2).max(30)).max(10),
  brandIds: z.array(id).max(20),
  operatorIds: z.array(id).max(30),
  youtube: z.string().trim().max(200),
  requires4gb: z.boolean(),
});

export async function previewMarkdownAction(markdown: string): Promise<string> {
  await requireUser();
  return renderMarkdown(typeof markdown === "string" ? markdown : "");
}

export async function saveDetailsAction(state: FormState, formData: FormData): Promise<FormState> {
  const attempt = previousAttempt(state);
  const who = await author(attempt);
  if ("error" in who) return who.error;
  const mod = await loadEditableMod(who.user, field(formData, "modId") ?? "");
  if (!mod) return failure(attempt, "MOD_NOT_FOUND");

  const category = await db().mod.findUniqueOrThrow({ where: { id: mod.id }, select: { categoryId: true, category: { select: { slug: true } } } });
  const facets = categoryFacets(category.category.slug);
  const fields = await getCategoryFields(category.categoryId);
  const strings = (name: string) => formData.getAll(name).filter((v): v is string => typeof v === "string");
  const attributes = parseAttributeForm(fields, { get: (name) => field(formData, name), getAll: strings });
  if (Object.keys(attributes.errors).length > 0) {
    // Odoslané hodnoty vrátime, aby autor po chybe nemusel všetko vypĺňať znova
    const values: Record<string, string> = {
      vehicleModel: field(formData, "vehicleModel") ?? "",
      tags: field(formData, "tags") ?? "",
      youtube: field(formData, "youtube") ?? "",
      requires4gb: formData.get("requires4gb") === "on" ? "on" : "",
      openOmsi: field(formData, "openOmsi") ?? "",
      brandIds: strings("brandIds").join(","),
      operatorIds: strings("operatorIds").join(","),
    };
    for (const f of fields) values[fieldInputName(f.key)] = strings(fieldInputName(f.key)).join(",");
    const fieldErrors = Object.fromEntries(Object.entries(attributes.errors).map(([key, code]) => [fieldInputName(key), code]));
    return failure(attempt, "GENERIC", { fieldErrors, values });
  }

  const location = facets.includes("location") ? parseLocation(field(formData, "mapLat"), field(formData, "mapLng")) : null;
  if (location === "INVALID") return invalid(attempt, "mapLat", "GENERIC");

  const tags = (field(formData, "tags") ?? "")
    .split(",")
    .map((t) => t.trim().toLowerCase().replace(/^#/, ""))
    .filter(Boolean);
  const parsed = detailsSchema.safeParse({
    description: field(formData, "description") ?? "",
    vehicleModel: field(formData, "vehicleModel") ?? "",
    tags: [...new Set(tags)],
    // Značky a dopravcovia iba pri kategóriách, ktorých sa týkajú (mapa nemá model autobusu)
    brandIds: facets.includes("brand") ? strings("brandIds") : [],
    operatorIds: facets.includes("operator") ? strings("operatorIds") : [],
    youtube: field(formData, "youtube") ?? "",
    requires4gb: formData.get("requires4gb") === "on",
  });
  if (!parsed.success) {
    const path = String(parsed.error.issues[0]?.path[0] ?? "");
    if (path === "description") return invalid(attempt, "description", "DESCRIPTION_TOO_LONG");
    if (path === "tags") return invalid(attempt, "tags", "TAGS_INVALID");
    return failure(attempt, "GENERIC");
  }
  const youtubeId = parsed.data.youtube ? parseYoutubeId(parsed.data.youtube) : null;
  if (parsed.data.youtube && !youtubeId) return invalid(attempt, "youtube", "YOUTUBE_INVALID");

  const [brands, operators] = await Promise.all([
    db().vehicleBrand.findMany({ where: { id: { in: parsed.data.brandIds } }, select: { id: true } }),
    db().operator.findMany({ where: { id: { in: parsed.data.operatorIds } }, select: { id: true } }),
  ]);

  await db().$transaction([
    db().mod.update({
      where: { id: mod.id },
      data: {
        description: parsed.data.description,
        descriptionHtml: renderMarkdown(parsed.data.description),
        vehicleModel: facets.includes("brand") ? parsed.data.vehicleModel || null : null,
        attributes: attributes.values,
        tags: parsed.data.tags,
        youtubeVideoId: youtubeId,
        requires4GbPatch: parsed.data.requires4gb,
        openOmsi: parseOpenOmsi(field(formData, "openOmsi")),
        mapLat: location?.lat ?? null,
        mapLng: location?.lng ?? null,
      },
    }),
    db().modBrand.deleteMany({ where: { modId: mod.id } }),
    db().modBrand.createMany({ data: brands.map((b) => ({ modId: mod.id, brandId: b.id })) }),
    db().modOperator.deleteMany({ where: { modId: mod.id } }),
    db().modOperator.createMany({ data: operators.map((o) => ({ modId: mod.id, operatorId: o.id })) }),
  ]);
  await refreshSearchExtra(mod.id);
  revalidateMod(mod.id, mod.slug);
  redirect(`/nahrat/${mod.id}?krok=subory`);
}

// ───────────────────────────── Krok 3: Verzia a súbory ─────────────────────────────

const versionSchema = z.object({
  version: z.string().trim().regex(VERSION_PATTERN).max(30),
  changelog: z.string().max(10_000),
});

export async function saveVersionAction(state: FormState, formData: FormData): Promise<FormState> {
  const attempt = previousAttempt(state);
  const who = await author(attempt);
  if ("error" in who) return who.error;
  const mod = await loadEditableMod(who.user, field(formData, "modId") ?? "");
  if (!mod) return failure(attempt, "MOD_NOT_FOUND");

  const values = { version: field(formData, "version") ?? "", changelog: field(formData, "changelog") ?? "" };
  const parsed = versionSchema.safeParse(values);
  if (!parsed.success) return invalid(attempt, "version", "VERSION_FORMAT", values);
  const version = parsed.data.version.replace(/^v/i, "");

  const working = await getWorkingVersion(mod.id);
  const clash = await db().modVersion.findFirst({ where: { modId: mod.id, version, id: working ? { not: working.id } : undefined }, select: { id: true } });
  if (clash) return invalid(attempt, "version", "VERSION_EXISTS", values);

  const data = { version, changelog: parsed.data.changelog, changelogHtml: renderMarkdown(parsed.data.changelog) };
  if (working) await db().modVersion.update({ where: { id: working.id }, data });
  else await db().modVersion.create({ data: { ...data, modId: mod.id, status: "DRAFT" } });

  revalidateMod(mod.id, mod.slug);
  return { status: "success", attempt: attempt + 1 };
}

const attachSchema = z.object({
  uploadId: id,
  kind: z.enum(["MAIN", "PATCH", "OPTIONAL"]),
  displayName: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500),
  patchForFileId: id.optional(),
  mirrorUrl: z.url({ protocol: /^https$/ }).max(500).optional(),
  mirrorLabel: z.string().trim().max(40).optional(),
});

export async function attachFileAction(state: FormState, formData: FormData): Promise<FormState> {
  return keepValues(await attachFileInner(state, formData), formData, ["displayName", "description", "mirrorUrl", "mirrorLabel", "patchForFileId"]);
}

async function attachFileInner(state: FormState, formData: FormData): Promise<FormState> {
  const attempt = previousAttempt(state);
  const who = await author(attempt);
  if ("error" in who) return who.error;
  const mod = await loadEditableMod(who.user, field(formData, "modId") ?? "");
  if (!mod) return failure(attempt, "MOD_NOT_FOUND");
  const working = await getWorkingVersion(mod.id);
  if (!working) return failure(attempt, "NOT_EDITABLE");

  const parsed = attachSchema.safeParse({
    uploadId: field(formData, "uploadId"),
    kind: field(formData, "kind"),
    displayName: field(formData, "displayName") ?? "",
    description: field(formData, "description") ?? "",
    patchForFileId: field(formData, "patchForFileId") || undefined,
    mirrorUrl: field(formData, "mirrorUrl") || undefined,
    mirrorLabel: field(formData, "mirrorLabel") || undefined,
  });
  if (!parsed.success) {
    const path = String(parsed.error.issues[0]?.path[0] ?? "");
    if (path === "mirrorUrl") return invalid(attempt, "mirrorUrl", "URL_INVALID");
    if (path === "displayName") return { ...invalid(attempt, "displayName", "TITLE_LENGTH"), errorParams: { min: "2", max: "120" } };
    return failure(attempt, "GENERIC");
  }
  const input = parsed.data;

  if (input.kind === "MAIN") {
    const existing = await db().modFile.count({ where: { versionId: working.id, kind: "MAIN" } });
    if (existing > 0) return failure(attempt, "MAIN_EXISTS");
  }
  if (input.kind === "PATCH") {
    // Patch musí nadväzovať na hlavný súbor zverejnenej verzie alebo tejto verzie
    const target = input.patchForFileId
      ? await db().modFile.findFirst({ where: { id: input.patchForFileId, modId: mod.id, kind: { in: ["MAIN", "OLD_VERSION"] } }, select: { id: true } })
      : null;
    if (!target) return invalid(attempt, "patchForFileId", "PATCH_TARGET_REQUIRED");
  }

  const sortOrder = await db().modFile.count({ where: { versionId: working.id } });
  try {
    await createModFileFromUpload(who.user.id, {
      uploadId: input.uploadId,
      modId: mod.id,
      versionId: working.id,
      kind: input.kind,
      displayName: input.displayName,
      description: input.description,
      patchForFileId: input.kind === "PATCH" ? (input.patchForFileId ?? null) : null,
      mirrorUrl: input.mirrorUrl ?? null,
      mirrorLabel: input.mirrorLabel ?? null,
      sortOrder,
    });
  } catch (error) {
    if (error instanceof HttpError) return failure(attempt, error.code === "UPLOAD_NOT_READY" ? "UPLOAD_NOT_READY" : "GENERIC");
    throw error;
  }
  revalidateMod(mod.id, mod.slug);
  return { status: "success", attempt: attempt + 1 };
}

export async function removeFileAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const mod = await loadEditableMod(user, field(formData, "modId") ?? "");
  const fileId = field(formData, "fileId") ?? "";
  if (!mod || !id.safeParse(fileId).success) return;
  const working = await getWorkingVersion(mod.id);
  if (!working) return;
  const file = await db().modFile.findFirst({ where: { id: fileId, versionId: working.id }, select: { id: true, storageKey: true, storageDriver: true } });
  if (!file) return;
  await db().modFile.delete({ where: { id: file.id } });
  await storage(file.storageDriver).delete(file.storageKey);
  await audit({ action: "file.deleted", actorId: user.id, targetType: "file", targetId: file.id, metadata: { modId: mod.id } });
  revalidateMod(mod.id, mod.slug);
}

// ───────────────────────────── Krok 4: Screenshoty ─────────────────────────────

export async function reorderImagesAction(modId: string, orderedIds: string[]): Promise<void> {
  const user = await requireUser();
  const mod = await loadEditableMod(user, modId);
  if (!mod || !Array.isArray(orderedIds) || orderedIds.length > 60) return;
  const images = await db().mediaImage.findMany({ where: { modId: mod.id, kind: "SCREENSHOT" }, select: { id: true } });
  const owned = new Set(images.map((i) => i.id));
  const ids = orderedIds.filter((x) => typeof x === "string" && owned.has(x));
  await db().$transaction(ids.map((imageId, index) => db().mediaImage.update({ where: { id: imageId }, data: { sortOrder: index } })));
  revalidateMod(mod.id, mod.slug);
}

export async function setPrimaryImageAction(modId: string, imageId: string): Promise<void> {
  const user = await requireUser();
  const mod = await loadEditableMod(user, modId);
  if (!mod) return;
  const image = await db().mediaImage.findFirst({ where: { id: imageId, modId: mod.id }, select: { id: true } });
  if (!image) return;
  await db().$transaction([
    db().mediaImage.updateMany({ where: { modId: mod.id }, data: { isPrimary: false } }),
    db().mediaImage.update({ where: { id: image.id }, data: { isPrimary: true } }),
  ]);
  revalidateMod(mod.id, mod.slug);
}

export async function deleteImageAction(modId: string, imageId: string): Promise<void> {
  const user = await requireUser();
  const mod = await loadEditableMod(user, modId);
  if (!mod) return;
  const image = await db().mediaImage.findFirst({ where: { id: imageId, modId: mod.id }, select: { id: true, storageKey: true, fullKey: true, storageDriver: true, isPrimary: true } });
  if (!image) return;
  await db().mediaImage.delete({ where: { id: image.id } });
  await Promise.all([storage(image.storageDriver).delete(image.storageKey), storage(image.storageDriver).delete(image.fullKey)]);
  if (image.isPrimary) {
    const next = await db().mediaImage.findFirst({ where: { modId: mod.id, kind: "SCREENSHOT" }, orderBy: { sortOrder: "asc" }, select: { id: true } });
    if (next) await db().mediaImage.update({ where: { id: next.id }, data: { isPrimary: true } });
  }
  revalidateMod(mod.id, mod.slug);
}

// ───────────────────────────── Krok 5: Závislosti, kredity, licencia ─────────────────────────────

const extrasSchema = z.object({
  dlcIds: z.array(id).max(30),
  internal: z.array(z.object({ modId: id, required: z.boolean() })).max(30),
  external: z
    .array(z.object({ label: z.string().trim().min(2).max(80), url: z.url({ protocol: /^https$/ }).max(500), required: z.boolean() }))
    .max(15),
  credits: z
    .array(
      z.object({
        name: z.string().trim().min(2).max(60),
        role: z.enum(["MODEL", "TEXTURES", "SCRIPTS", "SOUNDS", "MAP", "REPAINT", "HOF", "ANNOUNCEMENTS", "TESTING", "OTHER"]),
        username: z.string().trim().max(24).optional(),
      }),
    )
    .max(40),
  licenseTerms: z.array(z.enum(["NO_REUPLOAD", "MODIFY_WITH_PERMISSION", "REPAINTS_ALLOWED", "NO_COMMERCIAL_USE", "CREDIT_REQUIRED", "FREE_TO_MODIFY"])).max(6),
  licenseNote: z.string().trim().max(1000),
});

export type ExtrasPayload = z.infer<typeof extrasSchema>;

export async function searchDependencyModsAction(modId: string, query: string): Promise<{ id: string; title: string; slug: string }[]> {
  await requireUser();
  const q = typeof query === "string" ? query.trim().slice(0, 60) : "";
  if (q.length < 2) return [];
  const rows = await db().$queryRaw<{ id: string; title: string; slug: string }[]>`
    SELECT m."id", m."title", m."slug" FROM "Mod" m
    WHERE m."status" = 'PUBLISHED' AND m."id" <> ${modId}
      AND m."searchText" LIKE '%' || omsi_normalize(${q.replace(/[\\%_]/g, (c) => `\\${c}`)}) || '%' ESCAPE '\\'
    ORDER BY m."downloadCount" DESC LIMIT 8`;
  return rows;
}

export async function saveExtrasAction(state: FormState, formData: FormData): Promise<FormState> {
  const attempt = previousAttempt(state);
  const who = await author(attempt);
  if ("error" in who) return who.error;
  const mod = await loadEditableMod(who.user, field(formData, "modId") ?? "");
  if (!mod) return failure(attempt, "MOD_NOT_FOUND");

  let raw: unknown;
  try {
    raw = JSON.parse(field(formData, "payload") ?? "null");
  } catch {
    return failure(attempt, "GENERIC");
  }
  const parsed = extrasSchema.safeParse(raw);
  if (!parsed.success) {
    const path = String(parsed.error.issues[0]?.path[0] ?? "");
    if (path === "credits") return failure(attempt, "CREDIT_INVALID");
    if (path === "external") return failure(attempt, "URL_INVALID");
    return failure(attempt, "DEPENDENCY_INVALID");
  }
  const data = parsed.data;

  const [dlcs, targets, users] = await Promise.all([
    db().steamDlc.findMany({ where: { id: { in: data.dlcIds } }, select: { id: true } }),
    db().mod.findMany({ where: { id: { in: data.internal.map((d) => d.modId).filter((x) => x !== mod.id) }, status: "PUBLISHED" }, select: { id: true } }),
    db().user.findMany({ where: { username: { in: data.credits.flatMap((c) => (c.username ? [c.username.toLowerCase()] : [])) } }, select: { id: true, username: true } }),
  ]);
  const validTargets = new Set(targets.map((t) => t.id));
  const userByName = new Map(users.map((u) => [u.username, u.id]));

  await db().$transaction([
    db().modDependency.deleteMany({ where: { modId: mod.id } }),
    db().modDependency.createMany({
      data: [
        ...dlcs.map((d, i) => ({ modId: mod.id, kind: "STEAM_DLC" as const, required: true, steamDlcId: d.id, sortOrder: i })),
        ...data.internal
          .filter((d) => validTargets.has(d.modId))
          .map((d, i) => ({ modId: mod.id, kind: "INTERNAL_MOD" as const, required: d.required, targetModId: d.modId, sortOrder: 100 + i })),
        ...data.external.map((d, i) => ({
          modId: mod.id,
          kind: "EXTERNAL_LINK" as const,
          required: d.required,
          externalUrl: d.url,
          externalLabel: d.label,
          sortOrder: 200 + i,
        })),
      ],
    }),
    db().modCredit.deleteMany({ where: { modId: mod.id } }),
    db().modCredit.createMany({
      data: data.credits.map((c, i) => ({
        modId: mod.id,
        name: c.name,
        role: c.role,
        userId: c.username ? (userByName.get(c.username.toLowerCase()) ?? null) : null,
        sortOrder: i,
      })),
    }),
    db().mod.update({ where: { id: mod.id }, data: { licenseTerms: [...new Set(data.licenseTerms)], licenseNote: data.licenseNote || null } }),
  ]);
  revalidateMod(mod.id, mod.slug);
  redirect(`/nahrat/${mod.id}?krok=odoslanie`);
}

// ───────────────────────────── Krok 6: Odoslanie ─────────────────────────────

export async function submitModAction(state: FormState, formData: FormData): Promise<FormState & { issues?: SubmitIssue[] }> {
  const attempt = previousAttempt(state);
  const who = await author(attempt);
  if ("error" in who) return who.error;
  const mod = await loadEditableMod(who.user, field(formData, "modId") ?? "");
  if (!mod) return failure(attempt, "MOD_NOT_FOUND");
  const working = await getWorkingVersion(mod.id);
  if (!working) return failure(attempt, "NOT_EDITABLE");

  const result = await submitVersion(who.user, mod.id, working.id);
  if (!result.ok) return { ...failure(attempt, result.issues[0] ?? "GENERIC"), issues: result.issues };
  revalidateMod(mod.id, mod.slug);
  revalidatePath("/");
  redirect(`/nahrat/${mod.id}?krok=odoslanie&hotovo=${result.published ? "zverejnene" : "schvalovanie"}`);
}

/** Nová verzia už zverejneného modu (Moje modifikácie → Pridať novú verziu). */
export async function startNewVersionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const mod = await loadEditableMod(user, field(formData, "modId") ?? "");
  if (!mod || mod.currentVersionId === null) return;
  const existing = await getWorkingVersion(mod.id);
  if (!existing) {
    const current = await db().modVersion.findUnique({ where: { id: mod.currentVersionId }, select: { version: true } });
    const parts = (current?.version ?? "1.0.0").split(/[.-]/).map((p) => Number(p));
    const next = Number.isFinite(parts[2]) ? `${parts[0] ?? 1}.${parts[1] ?? 0}.${(parts[2] ?? 0) + 1}` : `${current?.version ?? "1.0"}.1`;
    const taken = await db().modVersion.findFirst({ where: { modId: mod.id, version: next }, select: { id: true } });
    await db().modVersion.create({ data: { modId: mod.id, version: taken ? `${next}-${Date.now().toString(36)}` : next, status: "DRAFT" } });
  }
  redirect(`/nahrat/${mod.id}?krok=subory`);
}
