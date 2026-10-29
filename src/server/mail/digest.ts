import "server-only";
import { cs } from "@/i18n/dictionaries/cs";
import { sk } from "@/i18n/dictionaries/sk";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { notificationText, type NotificationKind } from "@/lib/notification-text";
import { notificationDigestMail } from "./templates";
import { sendMail } from "./transport";

const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
/** Krátke oneskorenie spojí upozornenia vzniknuté tesne po sebe do jedného emailu */
const SETTLE_MS = 60 * 1000;

/**
 * Súhrnný email s neodoslanými upozorneniami (1 email na používateľa a beh).
 * Používatelia s vypnutými emailmi a staré upozornenia sa iba označia ako vybavené.
 */
export async function sendNotificationDigests(now = new Date()): Promise<{ emails: number; skipped: number }> {
  const oldest = new Date(now.getTime() - MAX_AGE_MS);
  const settled = new Date(now.getTime() - SETTLE_MS);

  const stale = await db().notification.updateMany({
    where: { emailedAt: null, createdAt: { lt: oldest } },
    data: { emailedAt: now },
  });
  const optedOut = await db().notification.updateMany({
    where: {
      emailedAt: null,
      OR: [{ user: { emailNotify: false } }, { user: { emailVerified: false } }, { user: { bannedAt: { not: null } } }],
    },
    data: { emailedAt: now },
  });

  const pending = await db().notification.findMany({
    where: { emailedAt: null, createdAt: { lte: settled } },
    orderBy: { createdAt: "asc" },
    take: 2000,
    select: {
      id: true,
      type: true,
      data: true,
      link: true,
      user: { select: { id: true, email: true, name: true, locale: true } },
    },
  });

  const byUser = new Map<string, typeof pending>();
  for (const n of pending) {
    const list = byUser.get(n.user.id) ?? [];
    list.push(n);
    byUser.set(n.user.id, list);
  }

  const base = env().APP_URL;
  let emails = 0;
  for (const list of byUser.values()) {
    const first = list[0];
    if (!first) continue;
    const t = first.user.locale === "cs" ? cs : sk;
    const shown = list.slice(-20);
    const items = shown.map((n) => ({
      text: notificationText(t, n.type as NotificationKind, n.data),
      url: `${base}${n.link && n.link.startsWith("/") ? n.link : "/ucet/upozornenia"}`,
    }));
    try {
      await sendMail(
        notificationDigestMail(
          first.user.locale,
          first.user.email,
          first.user.name,
          {
            subject: t.notifications.emailSubject.replace("{count}", String(list.length)),
            intro: t.notifications.emailIntro,
            footer: t.notifications.emailFooter,
            open: t.notifications.emailOpen,
          },
          items,
          `${base}/ucet/upozornenia`,
        ),
      );
      await db().notification.updateMany({ where: { id: { in: list.map((n) => n.id) } }, data: { emailedAt: new Date() } });
      emails += 1;
    } catch (error) {
      // Nepodarené odoslanie sa zopakuje v ďalšom behu (do 3 dní)
      console.error("[digest] email zlyhal", first.user.id, error instanceof Error ? error.message : error);
    }
  }
  return { emails, skipped: stale.count + optedOut.count };
}
