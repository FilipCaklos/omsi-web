import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardCheck, FolderTree, Flag, Gauge, Package, ScrollText, Settings, Users } from "lucide-react";
import { SiteHeader } from "@/components/layout/site-header";
import { getDictionary } from "@/i18n/server";
import { db } from "@/lib/db";
import { can, type Permission } from "@/lib/rbac";
import { requirePagePermission } from "@/server/session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return { title: { default: t.admin.title, template: `%s · ${t.admin.title}` }, robots: { index: false, follow: false } };
}

/** Administrácia je dostupná od roly Moderátor; jednotlivé sekcie overujú ďalšie oprávnenia. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePagePermission("moderation:queue", "/admin");
  const { t } = await getDictionary();
  // Počty čakajúcich vecí priamo v navigácii – moderátor hneď vidí, kde je práca
  const [pendingVersions, pendingPlanned, pendingFiles, openReports] = await Promise.all([
    db().modVersion.count({ where: { status: "PENDING_REVIEW" } }),
    db().mod.count({ where: { status: "PENDING_REVIEW", plannedRelease: { isNot: null }, versions: { none: { status: "PENDING_REVIEW" } } } }),
    db().modFile.count({ where: { scanStatus: "REQUIRES_MOD_INSPECTION", version: { status: { not: "PENDING_REVIEW" } } } }),
    db().report.count({ where: { status: "OPEN" } }),
  ]);
  const items: { href: string; label: string; Icon: typeof Gauge; permission: Permission; count?: number }[] = [
    { href: "/admin", label: t.admin.nav.dashboard, Icon: Gauge, permission: "moderation:queue" },
    { href: "/admin/fronta", label: t.admin.nav.queue, Icon: ClipboardCheck, permission: "moderation:queue", count: pendingVersions + pendingPlanned + pendingFiles },
    { href: "/admin/nahlasenia", label: t.admin.nav.reports, Icon: Flag, permission: "report:resolve", count: openReports },
    { href: "/admin/mody", label: t.admin.nav.mods, Icon: Package, permission: "content:hide" },
    { href: "/admin/pouzivatelia", label: t.admin.nav.users, Icon: Users, permission: "user:ban" },
    { href: "/admin/kategorie", label: t.admin.nav.categories, Icon: FolderTree, permission: "category:manage" },
    { href: "/admin/nastavenia", label: t.admin.nav.settings, Icon: Settings, permission: "settings:manage" },
    { href: "/admin/audit", label: t.admin.nav.audit, Icon: ScrollText, permission: "audit:read" },
  ];

  return (
    <>
      <SiteHeader />
      <div className="mx-auto grid max-w-[1320px] gap-6 px-4 py-6 lg:grid-cols-[210px_1fr]">
        <nav aria-label={t.admin.title} className="lg:sticky lg:top-20 lg:self-start">
          <p className="mb-2 hidden text-xs font-bold uppercase tracking-wide text-muted lg:block">{t.admin.title}</p>
          <ul className="scrollbar-thin flex gap-1 overflow-x-auto lg:flex-col">
            {items
              .filter((item) => can(user.role, item.permission))
              .map(({ href, label, Icon, count }) => (
                <li key={href} className="shrink-0">
                  <Link href={href} className="flex h-9 items-center gap-2 rounded-[5px] px-3 text-sm text-muted hover:bg-raised hover:text-text">
                    <Icon size={15} strokeWidth={1.75} aria-hidden />
                    {label}
                    {count !== undefined && count > 0 && (
                      <span className="ml-auto rounded-[3px] bg-amber px-1.5 font-mono text-[11px] font-semibold tabular-nums text-amber-ink">{count}</span>
                    )}
                  </Link>
                </li>
              ))}
          </ul>
        </nav>
        <main id="obsah" className="min-w-0 space-y-5">
          {children}
        </main>
      </div>
    </>
  );
}
