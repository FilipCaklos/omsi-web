import type { Metadata } from "next";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { markAllNotificationsReadAction } from "@/app/actions/notifications";
import { EmptyState } from "@/components/catalog/section-heading";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { getDictionary } from "@/i18n/server";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { notificationText, type NotificationKind } from "@/lib/notification-text";
import { requirePageUser } from "@/server/session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return { title: t.notifications.title, robots: { index: false } };
}

export default async function NotificationsPage() {
  const user = await requirePageUser("/ucet/upozornenia");
  const { locale, t } = await getDictionary();
  const notifications = await db().notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, type: true, data: true, readAt: true, createdAt: true },
  });
  const unread = notifications.filter((n) => !n.readAt).length;

  return (
    <>
      <SiteHeader />
      <main id="obsah" className="mx-auto max-w-[800px] space-y-5 px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Bell size={22} strokeWidth={1.75} className="text-amber" aria-hidden />
            {t.notifications.title}
          </h1>
          {unread > 0 && (
            <form action={markAllNotificationsReadAction}>
              <button type="submit" className="inline-flex h-9 items-center gap-1.5 rounded-[5px] border border-line px-3 text-sm hover:bg-raised">
                <CheckCheck size={15} aria-hidden /> {t.notifications.markAll}
              </button>
            </form>
          )}
        </div>
        {notifications.length === 0 ? (
          <EmptyState>{t.notifications.empty}</EmptyState>
        ) : (
          <ul className="divide-y divide-line rounded-[5px] border border-line bg-surface">
            {notifications.map((n) => (
              <li key={n.id}>
                <Link href={`/ucet/upozornenia/${n.id}`} prefetch={false} className={`flex items-start gap-3 px-4 py-3 hover:bg-raised ${n.readAt ? "" : "bg-amber-soft/40"}`}>
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-amber"}`} aria-label={n.readAt ? undefined : t.notifications.unread} />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm ${n.readAt ? "" : "font-semibold"}`}>{notificationText(t, n.type as NotificationKind, n.data)}</span>
                    <span className="font-mono text-[11px] text-muted">{formatDateTime(locale, n.createdAt)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
