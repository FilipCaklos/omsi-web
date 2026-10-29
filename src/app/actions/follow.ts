"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { PUBLIC_MOD_STATUSES } from "@/server/mods/access";
import { getCurrentUser } from "@/server/session";

export type FollowState = { following: boolean; count: number; error?: "UNAUTHENTICATED" | "EMAIL_NOT_VERIFIED" | "MOD_NOT_FOUND" };

/** Prepne sledovanie projektu („Upozorniť pri vydaní“ / „Sledovať novinky“). */
export async function toggleFollowAction(state: FollowState, formData: FormData): Promise<FollowState> {
  const user = await getCurrentUser();
  if (!user) return { ...state, error: "UNAUTHENTICATED" };
  if (!user.emailVerified) return { ...state, error: "EMAIL_NOT_VERIFIED" };

  const modId = formData.get("modId");
  if (typeof modId !== "string" || !/^[a-z0-9]{10,40}$/.test(modId)) return { ...state, error: "MOD_NOT_FOUND" };
  const mod = await db().mod.findFirst({
    where: { id: modId, status: { in: [...PUBLIC_MOD_STATUSES] }, authorId: { not: user.id } },
    select: { id: true, slug: true },
  });
  if (!mod) return { ...state, error: "MOD_NOT_FOUND" };

  const key = { userId_modId: { userId: user.id, modId: mod.id } };
  const existing = await db().follow.findUnique({ where: key, select: { userId: true } });
  if (existing) await db().follow.delete({ where: key });
  else await db().follow.create({ data: { userId: user.id, modId: mod.id } });

  const count = await db().follow.count({ where: { modId: mod.id } });
  await db().mod.update({ where: { id: mod.id }, data: { followerCount: count } });
  revalidatePath(`/mod/${mod.slug}`);
  revalidatePath("/pripravovane");
  return { following: !existing, count };
}
