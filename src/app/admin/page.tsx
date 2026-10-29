import Link from "next/link";
import { AdminTitle } from "@/components/admin/admin-ui";
import { getDictionary } from "@/i18n/server";
import { db } from "@/lib/db";
import { formatDateTime, formatNumber } from "@/lib/format";
import { requirePagePermission } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  await requirePagePermission("moderation:queue", "/admin");
  const { locale, t } = await getDictionary();
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [pendingVersions, pendingPlanned, pendingFiles, openReports, users, mods, downloads, recent] = await Promise.all([
    db().modVersion.count({ where: { status: "PENDING_REVIEW" } }),
    db().mod.count({ where: { status: "PENDING_REVIEW", plannedRelease: { isNot: null }, versions: { none: { status: "PENDING_REVIEW" } } } }),
    db().modFile.count({ where: { scanStatus: "REQUIRES_MOD_INSPECTION", version: { status: { not: "PENDING_REVIEW" } } } }),
    db().report.count({ where: { status: "OPEN" } }),
    db().user.count(),
    db().mod.count({ where: { status: "PUBLISHED" } }),
    db().downloadEvent.count({ where: { createdAt: { gte: since } } }),
    db().auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 10, select: { id: true, action: true, createdAt: true, actor: { select: { username: true } } } }),
  ]);
  const tiles = [
    { label: t.admin.dashboard.pendingMods, value: pendingVersions + pendingPlanned, href: "/admin/fronta", alert: pendingVersions + pendingPlanned > 0 },
    { label: t.admin.dashboard.pendingFiles, value: pendingFiles, href: "/admin/fronta", alert: pendingFiles > 0 },
    { label: t.admin.dashboard.openReports, value: openReports, href: "/admin/nahlasenia", alert: openReports > 0 },
    { label: t.admin.dashboard.mods, value: mods, href: "/admin/mody", alert: false },
    { label: t.admin.dashboard.users, value: users, href: "/admin/pouzivatelia", alert: false },
    { label: t.admin.dashboard.downloads7d, value: downloads, href: "/admin", alert: false },
  ];

  return (
    <>
      <AdminTitle>{t.admin.nav.dashboard}</AdminTitle>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map((tile) => (
          <li key={tile.label}>
            <Link href={tile.href} className={`block rounded-[5px] border bg-surface p-4 hover:bg-raised ${tile.alert ? "border-amber/60" : "border-line"}`}>
              <p className="text-xs uppercase tracking-wide text-muted">{tile.label}</p>
              <p className={`mt-1 font-mono text-3xl font-bold tabular-nums ${tile.alert ? "text-amber" : ""}`}>{formatNumber(locale, tile.value)}</p>
            </Link>
          </li>
        ))}
      </ul>
      <section className="rounded-[5px] border border-line bg-surface">
        <h2 className="border-b border-line px-4 py-2 text-sm font-bold uppercase tracking-wide">{t.admin.nav.audit}</h2>
        <ul className="divide-y divide-line font-mono text-xs">
          {recent.map((entry) => (
            <li key={entry.id} className="flex flex-wrap gap-x-4 px-4 py-1.5">
              <span className="text-muted">{formatDateTime(locale, entry.createdAt)}</span>
              <span className="text-amber">{entry.action}</span>
              <span>{entry.actor ? `@${entry.actor.username}` : "—"}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
