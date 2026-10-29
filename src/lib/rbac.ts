/**
 * Role a oprávnenia. Čisté funkcie bez prístupu k DB – používajú ich serverové guardy aj UI
 * (UI iba skrýva prvky, rozhoduje vždy server).
 */
export const ROLES = ["GUEST", "USER", "VERIFIED_CREATOR", "MODERATOR", "ADMIN"] as const;
export type AppRole = (typeof ROLES)[number];

const RANK: Record<AppRole, number> = { GUEST: 0, USER: 1, VERIFIED_CREATOR: 2, MODERATOR: 3, ADMIN: 4 };

export const PERMISSIONS = {
  // Návštevník bez účtu
  "catalog:browse": "GUEST",
  "file:download": "GUEST",
  // Prihlásený používateľ
  "mod:create": "USER",
  "mod:edit-own": "USER",
  "review:write": "USER",
  "comment:write": "USER",
  "bug:report": "USER",
  "report:submit": "USER",
  "mod:follow": "USER",
  // Overený autor publikuje bez schvaľovania
  "mod:publish-without-review": "VERIFIED_CREATOR",
  // Moderátor
  "moderation:queue": "MODERATOR",
  "moderation:decide": "MODERATOR",
  "file:approve-inspection": "MODERATOR",
  "mod:edit-any": "MODERATOR",
  "report:resolve": "MODERATOR",
  "content:hide": "MODERATOR",
  "user:ban": "MODERATOR",
  "audit:read": "MODERATOR",
  // Administrátor
  "mod:feature": "ADMIN",
  "category:manage": "ADMIN",
  "user:change-role": "ADMIN",
  "settings:manage": "ADMIN",
} as const satisfies Record<string, AppRole>;

export type Permission = keyof typeof PERMISSIONS;

export function roleRank(role: AppRole): number {
  return RANK[role];
}

export function hasRole(role: AppRole | null | undefined, minimum: AppRole): boolean {
  return RANK[role ?? "GUEST"] >= RANK[minimum];
}

export function can(role: AppRole | null | undefined, permission: Permission): boolean {
  return hasRole(role, PERMISSIONS[permission]);
}

/**
 * Úprava obsahu: vlastník s oprávnením „-own“ alebo ktokoľvek s oprávnením „-any“.
 * Moderátor nemôže upravovať obsah administrátora.
 */
export function canManageOwned(
  actor: { id: string; role: AppRole } | null,
  owner: { id: string; role: AppRole },
  ownPermission: Permission,
  anyPermission: Permission,
): boolean {
  if (!actor) return false;
  if (actor.id === owner.id) return can(actor.role, ownPermission);
  return can(actor.role, anyPermission) && roleRank(actor.role) >= roleRank(owner.role);
}

/** Zmena roly iného používateľa: len na nižšiu rolu, než má aktér, a nikdy sám sebe. */
export function canAssignRole(actor: { id: string; role: AppRole }, targetId: string, targetRole: AppRole, newRole: AppRole): boolean {
  if (actor.id === targetId) return false;
  if (!can(actor.role, "user:change-role")) return false;
  if (newRole === "GUEST") return false;
  return roleRank(targetRole) < roleRank(actor.role) && roleRank(newRole) < roleRank(actor.role);
}

/** Ban: moderátor môže zabanovať iba používateľa s nižšou rolou. */
export function canBan(actor: { id: string; role: AppRole }, target: { id: string; role: AppRole }): boolean {
  return actor.id !== target.id && can(actor.role, "user:ban") && roleRank(target.role) < roleRank(actor.role);
}
