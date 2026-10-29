"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { audit } from "@/server/audit";
import { requireUser } from "@/server/session";
import { storage } from "@/server/storage";

const id = /^[a-z0-9]{10,40}$/;

async function load(formData: FormData) {
  const imageId = formData.get("imageId");
  if (typeof imageId !== "string" || !id.test(imageId)) return null;
  return db().mediaImage.findFirst({
    where: { id: imageId, kind: "COMMUNITY" },
    select: { id: true, ownerId: true, storageKey: true, fullKey: true, storageDriver: true, mod: { select: { slug: true, authorId: true } } },
  });
}

/** Moderátor zverejní fotku od hráča. */
export async function approveCommunityImageAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "moderation:queue")) return;
  const image = await load(formData);
  if (!image) return;
  await db().mediaImage.update({ where: { id: image.id }, data: { approvedAt: new Date() } });
  await audit({ action: "image.approved", actorId: user.id, targetType: "image", targetId: image.id });
  revalidatePath("/admin/fronta");
  if (image.mod) revalidatePath(`/mod/${image.mod.slug}`);
}

/** Zmazanie fotky: jej autor, autor modu alebo moderátor. */
export async function deleteCommunityImageAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const image = await load(formData);
  if (!image) return;
  const allowed = image.ownerId === user.id || image.mod?.authorId === user.id || can(user.role, "content:hide");
  if (!allowed) return;
  await db().mediaImage.delete({ where: { id: image.id } });
  await Promise.allSettled([storage(image.storageDriver).delete(image.storageKey), storage(image.storageDriver).delete(image.fullKey)]);
  await audit({ action: "image.deleted", actorId: user.id, targetType: "image", targetId: image.id });
  revalidatePath("/admin/fronta");
  if (image.mod) revalidatePath(`/mod/${image.mod.slug}`);
}
