import "server-only";
import { db } from "@/lib/db";
import { can, type AppRole } from "@/lib/rbac";
import { audit } from "@/server/audit";
import { onModAnnounced } from "./announce";
import { notifyFollowers } from "@/server/notifications";
import { missingRequired, readAttributes } from "@/lib/category-fields";
import { getCategoryFields } from "./category-fields";
import { refreshSearchExtra } from "./helpers";

export type SubmitIssue = "NO_MAIN_FILE" | "NO_SCREENSHOT" | "FILE_REJECTED" | "SUMMARY_LENGTH" | "ATTRIBUTES_MISSING" | "NOT_EDITABLE" | "MOD_NOT_FOUND";

/** Kontroly pred odoslaním verzie (rovnaké pre UI checklist aj server). */
export async function checkVersionReadiness(modId: string, versionId: string): Promise<SubmitIssue[]> {
  const mod = await db().mod.findUnique({
    where: { id: modId },
    select: {
      status: true,
      summary: true,
      categoryId: true,
      attributes: true,
      currentVersionId: true,
      _count: { select: { images: { where: { kind: "SCREENSHOT" } } } },
    },
  });
  const version = await db().modVersion.findFirst({
    where: { id: versionId, modId },
    select: { status: true, files: { select: { kind: true, scanStatus: true } } },
  });
  if (!mod || !version) return ["MOD_NOT_FOUND"];

  const issues: SubmitIssue[] = [];
  if (!["DRAFT", "CHANGES_REQUESTED"].includes(version.status)) issues.push("NOT_EDITABLE");
  const firstRelease = mod.currentVersionId === null;
  // Prvé vydanie potrebuje hlavný súbor; ďalšia verzia môže obsahovať iba patch alebo doplnky
  const hasMain = version.files.some((f) => f.kind === "MAIN");
  if (firstRelease ? !hasMain : version.files.length === 0) issues.push("NO_MAIN_FILE");
  if (version.files.some((f) => f.scanStatus === "REJECTED")) issues.push("FILE_REJECTED");
  if (mod._count.images === 0) issues.push("NO_SCREENSHOT");
  if (mod.summary.trim().length < 20) issues.push("SUMMARY_LENGTH");
  if (missingRequired(await getCategoryFields(mod.categoryId), readAttributes(mod.attributes)).length > 0) issues.push("ATTRIBUTES_MISSING");
  return issues;
}

/**
 * Zverejní verziu (overený autor ihneď, ostatní po schválení moderátorom):
 * staršie hlavné súbory sa presunú do archívu, mod dostane novú aktuálnu verziu.
 */
export async function publishVersion(versionId: string, actorId: string): Promise<void> {
  const now = new Date();
  let firstRelease = false;
  const version = await db().modVersion.findUniqueOrThrow({
    where: { id: versionId },
    select: {
      id: true,
      modId: true,
      version: true,
      files: { where: { kind: "MAIN" }, select: { id: true } },
      mod: { select: { slug: true, title: true, authorId: true } },
    },
  });
  await db().$transaction(async (tx) => {
    await tx.modVersion.update({ where: { id: versionId }, data: { status: "PUBLISHED", publishedAt: now } });
    if (version.files.length > 0) {
      await tx.modFile.updateMany({
        where: { modId: version.modId, kind: "MAIN", versionId: { not: versionId } },
        data: { kind: "OLD_VERSION" },
      });
    }
    const mod = await tx.mod.findUniqueOrThrow({ where: { id: version.modId }, select: { publishedAt: true, currentVersionId: true, status: true } });
    firstRelease = mod.currentVersionId === null;
    await tx.plannedRelease.updateMany({ where: { modId: version.modId, releasedAt: null }, data: { releasedAt: now } });
    await tx.mod.update({
      where: { id: version.modId },
      data: {
        // Mod skrytý/odstránený moderátorom zostáva skrytý – nová verzia ho nesmie vrátiť na web
        status: mod.status === "HIDDEN" || mod.status === "REMOVED" ? mod.status : "PUBLISHED",
        publishedAt: mod.publishedAt ?? now,
        lastUpdatedAt: now,
        currentVersionId: versionId,
      },
    });
  });
  await refreshSearchExtra(version.modId);
  await audit({
    action: "mod.published",
    actorId,
    targetType: "mod",
    targetId: version.modId,
    metadata: { versionId, version: version.version },
  });
  // Sledujúci pripravovaného projektu dostanú „je vonku“, sledujúci vydaného modu „nová verzia“
  await notifyFollowers({
    modId: version.modId,
    type: firstRelease ? "MOD_RELEASED" : "NEW_VERSION",
    link: `/mod/${version.mod.slug}#subory`,
    data: { modTitle: version.mod.title, version: version.version },
    exceptUserId: version.mod.authorId,
  });
  await onModAnnounced(version.modId, firstRelease ? "RELEASED" : "NEW_VERSION");
}

/** Odoslanie z Upload Wizardu. Vráti, či sa zverejnilo hneď, alebo čaká na moderátora. */
export async function submitVersion(
  user: { id: string; role: Exclude<AppRole, "GUEST"> },
  modId: string,
  versionId: string,
): Promise<{ ok: true; published: boolean } | { ok: false; issues: SubmitIssue[] }> {
  const issues = await checkVersionReadiness(modId, versionId);
  if (issues.length > 0) return { ok: false, issues };

  if (can(user.role, "mod:publish-without-review")) {
    await publishVersion(versionId, user.id);
    return { ok: true, published: true };
  }

  await db().$transaction(async (tx) => {
    await tx.modVersion.update({ where: { id: versionId }, data: { status: "PENDING_REVIEW" } });
    const mod = await tx.mod.findUniqueOrThrow({ where: { id: modId }, select: { currentVersionId: true, status: true } });
    // Zverejnený aj ohlásený (pripravovaný) mod zostáva viditeľný; nová verzia čaká samostatne
    const stillVisible = mod.currentVersionId !== null || mod.status === "PLANNED" || mod.status === "SCHEDULED";
    if (!stillVisible) await tx.mod.update({ where: { id: modId }, data: { status: "PENDING_REVIEW" } });
  });
  await audit({ action: "mod.submitted", actorId: user.id, targetType: "mod", targetId: modId, metadata: { versionId } });
  return { ok: true, published: false };
}
