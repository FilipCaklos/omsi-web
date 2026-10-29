"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/server/session";

export async function markAllNotificationsReadAction(): Promise<void> {
  const user = await requireUser();
  await db().notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/", "layout");
}
