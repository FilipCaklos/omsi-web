import type { ModStatus } from "@/generated/prisma/client";
import { can, canManageOwned, type AppRole } from "@/lib/rbac";

export const PUBLIC_MOD_STATUSES: readonly ModStatus[] = ["PUBLISHED", "PLANNED", "SCHEDULED"];

export type Viewer = { id: string; role: Exclude<AppRole, "GUEST"> } | null;
type ModRef = { status: ModStatus; author: { id: string; role: Exclude<AppRole, "GUEST"> } };

/** Verejné stavy vidí každý; koncepty a skryté mody iba autor a moderátor. */
export function canViewMod(viewer: Viewer, mod: ModRef): boolean {
  if (PUBLIC_MOD_STATUSES.includes(mod.status)) return true;
  if (!viewer) return false;
  if (viewer.id === mod.author.id) return mod.status !== "REMOVED";
  return can(viewer.role, "moderation:queue");
}

/** Úpravy: autor (nie počas schvaľovania) alebo moderátor s vyššou/rovnakou rolou. */
export function canEditMod(viewer: Viewer, mod: ModRef): boolean {
  if (!viewer || mod.status === "REMOVED") return false;
  if (viewer.id === mod.author.id && mod.status === "PENDING_REVIEW") return false;
  return canManageOwned(viewer, mod.author, "mod:edit-own", "mod:edit-any");
}
