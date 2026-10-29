import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getClientIp, hashIp } from "@/server/security/ip";

/** Uzavretý zoznam auditovaných akcií – nové akcie pridávaj sem. */
export const AUDIT_ACTIONS = [
  "auth.sign_up",
  "auth.sign_in",
  "auth.sign_in_failed",
  "auth.sign_in_blocked",
  "auth.sign_in_social",
  "auth.sign_out",
  "auth.email_verified",
  "auth.verification_resent",
  "auth.password_reset_requested",
  "auth.password_reset",
  "auth.password_changed",
  "auth.session_revoked",
  "auth.sessions_revoked_all",
  "auth.rate_limited",
  "auth.turnstile_failed",
  "user.profile_updated",
  "user.role_changed",
  "user.banned",
  "user.unbanned",
  "mod.created",
  "mod.updated",
  "mod.submitted",
  "mod.approved",
  "mod.changes_requested",
  "mod.rejected",
  "mod.published",
  "mod.hidden",
  "mod.removed",
  "mod.featured",
  "file.uploaded",
  "file.approved",
  "file.rejected",
  "file.flagged",
  "file.deleted",
  "report.created",
  "report.resolved",
  "report.dismissed",
  "category.created",
  "category.updated",
  "settings.updated",
  "review.hidden",
  "comment.hidden",
  "user.deleted",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditEntry = {
  action: AuditAction;
  actorId?: string | null;
  targetType?: string;
  targetId?: string;
  metadata?: Prisma.InputJsonObject;
  /** Hlavičky požiadavky – z nich sa vypočíta hash IP */
  headers?: Headers;
};

/**
 * Zapíše záznam do audit logu. Chyba zápisu nikdy nezhodí hlavnú akciu,
 * ale je zalogovaná na stderr, aby ju zachytil monitoring.
 */
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await db().auditLog.create({
      data: {
        action: entry.action,
        actorId: entry.actorId ?? null,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        metadata: entry.metadata ?? {},
        ipHash: entry.headers ? hashIp(getClientIp(entry.headers)) : null,
      },
    });
  } catch (error) {
    console.error("[audit] zápis zlyhal", entry.action, error instanceof Error ? error.message : error);
  }
}
