import "server-only";
import type { NotificationType, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

export type NotifyInput = {
  userId: string;
  type: NotificationType;
  modId?: string | null;
  link?: string | null;
  data?: Prisma.InputJsonObject;
  /** false = iba na webe (emailedAt sa vyplní hneď, súhrnný email ho preskočí) */
  email?: boolean;
};

/** Webová notifikácia (zvonček). Súhrnný email posiela plánovač podľa nastavenia používateľa. */
export async function notify(input: NotifyInput | NotifyInput[]): Promise<void> {
  const items = Array.isArray(input) ? input : [input];
  if (items.length === 0) return;
  const now = new Date();
  await db().notification.createMany({
    data: items.map((n) => ({
      userId: n.userId,
      type: n.type,
      modId: n.modId ?? null,
      link: n.link ?? null,
      data: n.data ?? {},
      emailedAt: n.email === false ? now : null,
    })),
  });
}

/** Upozorní všetkých sledujúcich projektu (okrem autora akcie). */
export async function notifyFollowers(params: {
  modId: string;
  type: Extract<NotificationType, "DEVLOG_POSTED" | "MOD_RELEASED" | "NEW_VERSION">;
  link: string;
  data: Prisma.InputJsonObject;
  exceptUserId?: string;
}): Promise<number> {
  const follows = await db().follow.findMany({
    where: { modId: params.modId, ...(params.exceptUserId ? { userId: { not: params.exceptUserId } } : {}) },
    select: { userId: true, notifyEmail: true },
  });
  await notify(
    follows.map((f) => ({
      userId: f.userId,
      type: params.type,
      modId: params.modId,
      link: params.link,
      data: params.data,
      email: f.notifyEmail,
    })),
  );
  return follows.length;
}
