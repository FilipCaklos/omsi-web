import "server-only";
import type { ModerationDecision } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { hasRole, type AppRole } from "@/lib/rbac";
import { audit } from "@/server/audit";
import { publishVersion } from "@/server/mods/publish";
import { notify } from "@/server/notifications";

export type Moderator = { id: string; role: Exclude<AppRole, "GUEST"> };
export type ModerationError = "MOD_NOT_FOUND" | "NOTHING_PENDING" | "COMMENT_REQUIRED" | "FORBIDDEN";
type Result = { ok: true } | { ok: false; error: ModerationError };

export type QueueItem =
  | { kind: "NEW_MOD" | "NEW_VERSION"; modId: string; slug: string; title: string; author: string; version: string; files: number; inspection: number; at: Date; scheduledAt: Date | null }
  | { kind: "PLANNED"; modId: string; slug: string; title: string; author: string; at: Date }
  | { kind: "FILE"; modId: string; slug: string; title: string; author: string; fileId: string; fileName: string; at: Date };

/** Fronta moderátora: nové mody, nové verzie, ohlásenia pripravovaných vydaní a súbory na manuálnu kontrolu. */
export async function getQueue(): Promise<QueueItem[]> {
  const [versions, planned, files] = await Promise.all([
    db().modVersion.findMany({
      where: { status: "PENDING_REVIEW" },
      orderBy: { updatedAt: "asc" },
      take: 200,
      select: {
        version: true,
        updatedAt: true,
        scheduledAt: true,
        _count: { select: { files: true } },
        files: { where: { scanStatus: "REQUIRES_MOD_INSPECTION" }, select: { id: true } },
        mod: { select: { id: true, slug: true, title: true, currentVersionId: true, author: { select: { username: true } } } },
      },
    }),
    db().mod.findMany({
      where: { status: "PENDING_REVIEW", plannedRelease: { isNot: null }, versions: { none: { status: "PENDING_REVIEW" } } },
      orderBy: { updatedAt: "asc" },
      take: 200,
      select: { id: true, slug: true, title: true, updatedAt: true, author: { select: { username: true } } },
    }),
    db().modFile.findMany({
      where: { scanStatus: "REQUIRES_MOD_INSPECTION", version: { status: { not: "PENDING_REVIEW" } } },
      orderBy: { createdAt: "asc" },
      take: 200,
      select: { id: true, displayName: true, createdAt: true, mod: { select: { id: true, slug: true, title: true, author: { select: { username: true } } } } },
    }),
  ]);
  return [
    ...versions.map((v): QueueItem => ({
      kind: v.mod.currentVersionId === null ? "NEW_MOD" : "NEW_VERSION",
      modId: v.mod.id,
      slug: v.mod.slug,
      title: v.mod.title,
      author: v.mod.author.username,
      version: v.version,
      files: v._count.files,
      inspection: v.files.length,
      at: v.updatedAt,
      scheduledAt: v.scheduledAt,
    })),
    ...planned.map((m): QueueItem => ({ kind: "PLANNED", modId: m.id, slug: m.slug, title: m.title, author: m.author.username, at: m.updatedAt })),
    ...files.map((f): QueueItem => ({
      kind: "FILE",
      modId: f.mod.id,
      slug: f.mod.slug,
      title: f.mod.title,
      author: f.mod.author.username,
      fileId: f.id,
      fileName: f.displayName,
      at: f.createdAt,
    })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
}

async function loadForDecision(actor: Moderator, modId: string) {
  const mod = await db().mod.findUnique({
    where: { id: modId },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      authorId: true,
      currentVersionId: true,
      author: { select: { role: true } },
      plannedRelease: { select: { autoPublish: true } },
      versions: { where: { status: "PENDING_REVIEW" }, orderBy: { createdAt: "desc" }, take: 1, select: { id: true, version: true, scheduledAt: true } },
    },
  });
  if (!mod) return "MOD_NOT_FOUND";
  // Vlastný obsah schvaľuje iný moderátor; administrátor môže všetko
  if (mod.authorId === actor.id && !hasRole(actor.role, "ADMIN")) return "FORBIDDEN";
  return { mod, version: mod.versions[0] ?? null };
}

async function record(actor: Moderator, modId: string, versionId: string | null, decision: ModerationDecision, comment: string) {
  await db().moderationAction.create({ data: { modId, versionId, moderatorId: actor.id, decision, comment } });
}

export async function approve(actor: Moderator, modId: string, comment: string): Promise<Result> {
  const loaded = await loadForDecision(actor, modId);
  if (typeof loaded === "string") return { ok: false, error: loaded };
  const { mod, version } = loaded;

  if (version) {
    const scheduleLater = version.scheduledAt !== null && version.scheduledAt.getTime() > Date.now() && mod.plannedRelease?.autoPublish === true && mod.currentVersionId === null;
    if (scheduleLater) {
      await db().$transaction([
        db().modVersion.update({ where: { id: version.id }, data: { status: "SCHEDULED" } }),
        db().mod.update({ where: { id: mod.id }, data: { status: "SCHEDULED" } }),
      ]);
    } else {
      await publishVersion(version.id, actor.id);
    }
  } else if (mod.status === "PENDING_REVIEW" && mod.plannedRelease) {
    await db().mod.update({ where: { id: mod.id }, data: { status: "PLANNED" } });
  } else {
    return { ok: false, error: "NOTHING_PENDING" };
  }

  await record(actor, mod.id, version?.id ?? null, "APPROVED", comment);
  await notify({ userId: mod.authorId, type: "MOD_APPROVED", modId: mod.id, link: `/mod/${mod.slug}`, data: { modTitle: mod.title, comment } });
  await audit({ action: "mod.approved", actorId: actor.id, targetType: "mod", targetId: mod.id, metadata: { versionId: version?.id ?? null } });
  return { ok: true };
}

export async function requestChanges(actor: Moderator, modId: string, comment: string): Promise<Result> {
  if (comment.trim().length < 5) return { ok: false, error: "COMMENT_REQUIRED" };
  const loaded = await loadForDecision(actor, modId);
  if (typeof loaded === "string") return { ok: false, error: loaded };
  const { mod, version } = loaded;
  if (!version && mod.status !== "PENDING_REVIEW") return { ok: false, error: "NOTHING_PENDING" };

  await db().$transaction([
    ...(version ? [db().modVersion.update({ where: { id: version.id }, data: { status: "CHANGES_REQUESTED" } })] : []),
    ...(mod.status === "PENDING_REVIEW" ? [db().mod.update({ where: { id: mod.id }, data: { status: "CHANGES_REQUESTED" } })] : []),
  ]);
  await record(actor, mod.id, version?.id ?? null, "CHANGES_REQUESTED", comment);
  await notify({ userId: mod.authorId, type: "MOD_CHANGES_REQUESTED", modId: mod.id, link: "/ucet/mody", data: { modTitle: mod.title, comment } });
  await audit({ action: "mod.changes_requested", actorId: actor.id, targetType: "mod", targetId: mod.id, metadata: { comment } });
  return { ok: true };
}

export async function reject(actor: Moderator, modId: string, comment: string): Promise<Result> {
  if (comment.trim().length < 5) return { ok: false, error: "COMMENT_REQUIRED" };
  const loaded = await loadForDecision(actor, modId);
  if (typeof loaded === "string") return { ok: false, error: loaded };
  const { mod, version } = loaded;
  if (!version && mod.status !== "PENDING_REVIEW") return { ok: false, error: "NOTHING_PENDING" };

  await db().$transaction([
    ...(version ? [db().modVersion.update({ where: { id: version.id }, data: { status: "REJECTED" } })] : []),
    // Už zverejnený mod ostáva (zamieta sa len nová verzia); nový obsah sa odstráni z verejnosti
    ...(mod.currentVersionId === null ? [db().mod.update({ where: { id: mod.id }, data: { status: "REMOVED" } })] : []),
  ]);
  await record(actor, mod.id, version?.id ?? null, "REJECTED", comment);
  await notify({ userId: mod.authorId, type: "MOD_REJECTED", modId: mod.id, link: "/ucet/mody", data: { modTitle: mod.title, comment } });
  await audit({ action: "mod.rejected", actorId: actor.id, targetType: "mod", targetId: mod.id, metadata: { comment } });
  return { ok: true };
}

/** Manuálna kontrola súboru (napr. OMSI .dll plugin) – povoliť na verejné stiahnutie alebo zablokovať. */
export async function decideFile(actor: Moderator, fileId: string, allow: boolean, comment: string): Promise<Result> {
  const file = await db().modFile.findUnique({
    where: { id: fileId },
    select: { id: true, modId: true, versionId: true, scanStatus: true, displayName: true, mod: { select: { authorId: true } } },
  });
  if (!file) return { ok: false, error: "MOD_NOT_FOUND" };
  if (file.mod.authorId === actor.id && !hasRole(actor.role, "ADMIN")) return { ok: false, error: "FORBIDDEN" };
  if (file.scanStatus !== "REQUIRES_MOD_INSPECTION") return { ok: false, error: "NOTHING_PENDING" };
  if (!allow && comment.trim().length < 5) return { ok: false, error: "COMMENT_REQUIRED" };

  await db().modFile.update({
    where: { id: file.id },
    data: { scanStatus: allow ? "CLEAN" : "REJECTED", approvedById: actor.id, approvedAt: new Date() },
  });
  await record(actor, file.modId, file.versionId, allow ? "FILE_APPROVED" : "FILE_REJECTED", comment);
  await audit({ action: allow ? "file.approved" : "file.rejected", actorId: actor.id, targetType: "file", targetId: file.id, metadata: { comment } });
  return { ok: true };
}
