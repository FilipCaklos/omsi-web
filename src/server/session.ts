import "server-only";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import type { AppLocale } from "@/i18n/config";
import { db } from "@/lib/db";
import { can, type AppRole, type Permission } from "@/lib/rbac";
import { safeRedirectPath } from "@/lib/validation/auth";
import { getAuth } from "@/server/auth";

export type CurrentUser = {
  id: string;
  sessionId: string;
  username: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  role: Exclude<AppRole, "GUEST">;
  locale: AppLocale;
};

/**
 * Aktuálne prihlásený používateľ (raz za požiadavku vďaka React cache).
 * Rola sa vždy číta z DB – nikdy z cookie ani zo session cache.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => getUserForHeaders(await headers()));

/** Pre Route Handlery – používateľ podľa hlavičiek konkrétnej požiadavky. */
export async function getUserForHeaders(requestHeaders: Headers): Promise<CurrentUser | null> {
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) return null;

  const user = await db().user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      username: true,
      name: true,
      email: true,
      emailVerified: true,
      image: true,
      role: true,
      locale: true,
      bannedAt: true,
      bannedUntil: true,
    },
  });
  if (!user) return null;
  if (user.bannedAt && (user.bannedUntil === null || user.bannedUntil.getTime() > Date.now())) {
    // Ban udelený počas aktívnej session ju okamžite zneplatní
    await db().session.deleteMany({ where: { userId: user.id } });
    return null;
  }

  return {
    id: user.id,
    sessionId: session.session.id,
    username: user.username,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    image: user.image,
    role: user.role,
    locale: user.locale,
  };
}

export class AccessDeniedError extends Error {
  constructor(public readonly code: "UNAUTHENTICATED" | "FORBIDDEN") {
    super(code);
    this.name = "AccessDeniedError";
  }
}

/** Pre Server Actions a Route Handlery – vyhodí AccessDeniedError. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AccessDeniedError("UNAUTHENTICATED");
  return user;
}

export async function requirePermission(permission: Permission): Promise<CurrentUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) throw new AccessDeniedError("FORBIDDEN");
  return user;
}

/** Pre stránky – neprihláseného presmeruje na prihlásenie s návratom späť. */
export async function requirePageUser(returnTo: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/prihlasenie?next=${encodeURIComponent(safeRedirectPath(returnTo))}`);
  return user;
}

/** Pre stránky s oprávnením – bez oprávnenia vráti 404 (neprezrádza existenciu administrácie). */
export async function requirePagePermission(permission: Permission, returnTo: string): Promise<CurrentUser> {
  const user = await requirePageUser(returnTo);
  if (!can(user.role, permission)) notFound();
  return user;
}
