"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/server/session";

const id = /^[a-z0-9]{10,40}$/;

/** Zapne/vypne upozornenie na novú verziu pre jeden stiahnutý mod. */
export async function toggleDownloadNotifyAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const modId = formData.get("modId");
  if (typeof modId !== "string" || !id.test(modId)) return;
  const row = await db().userDownload.findUnique({ where: { userId_modId: { userId: user.id, modId } }, select: { notifyUpdates: true } });
  if (!row) return;
  await db().userDownload.update({ where: { userId_modId: { userId: user.id, modId } }, data: { notifyUpdates: !row.notifyUpdates } });
  revalidatePath("/ucet/stiahnute");
}

/** Odstráni mod z histórie (alebo celú históriu bez modId). */
export async function removeDownloadHistoryAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const modId = formData.get("modId");
  if (typeof modId === "string" && id.test(modId)) {
    await db().userDownload.deleteMany({ where: { userId: user.id, modId } });
  } else if (formData.get("all") === "1") {
    await db().userDownload.deleteMany({ where: { userId: user.id } });
  }
  revalidatePath("/ucet/stiahnute");
}
