import type { Metadata } from "next";
import Link from "next/link";
import { Bell, BellOff, Download, RefreshCw, Trash2 } from "lucide-react";
import { removeDownloadHistoryAction, toggleDownloadNotifyAction } from "@/app/actions/downloads";
import { EmptyState } from "@/components/catalog/section-heading";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { getDictionary } from "@/i18n/server";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { requirePageUser } from "@/server/session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return { title: t.downloads.title, robots: { index: false } };
}

/** „Moje stiahnuté“ – čo som si stiahol a či medzitým vyšla nová verzia. */
export default async function MyDownloadsPage() {
  const user = await requirePageUser("/ucet/stiahnute");
  const { locale, t } = await getDictionary();
  const rows = await db().userDownload.findMany({
    where: { userId: user.id, mod: { status: "PUBLISHED" } },
    orderBy: { lastDownloadAt: "desc" },
    take: 300,
    select: {
      modId: true,
      notifyUpdates: true,
      lastDownloadAt: true,
      version: { select: { id: true, version: true } },
      mod: { select: { slug: true, title: true, currentVersionId: true, currentVersion: { select: { version: true, publishedAt: true } } } },
    },
  });
  const d = t.downloads;
  const updates = rows.filter((r) => r.mod.currentVersionId !== null && r.version?.id !== r.mod.currentVersionId);

  return (
    <>
      <SiteHeader />
      <main id="obsah" className="mx-auto max-w-[1000px] space-y-5 px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">{d.title}</h1>
          {rows.length > 0 && (
            <form action={removeDownloadHistoryAction}>
              <input type="hidden" name="all" value="1" />
              <button type="submit" className="inline-flex h-9 items-center gap-1.5 rounded-[5px] border border-line px-3 text-sm text-muted hover:bg-raised hover:text-text">
                <Trash2 size={14} aria-hidden /> {d.clearAll}
              </button>
            </form>
          )}
        </div>
        <p className="max-w-2xl text-sm text-muted">{d.intro}</p>
        {updates.length > 0 && (
          <p className="flex items-center gap-2 rounded-[5px] border border-amber/50 bg-amber-soft px-3 py-2 text-sm">
            <RefreshCw size={15} className="text-amber" aria-hidden /> {d.updatesAvailable.replace("{n}", String(updates.length))}
          </p>
        )}
        {rows.length === 0 ? (
          <EmptyState>{d.empty}</EmptyState>
        ) : (
          <ul className="divide-y divide-line rounded-[5px] border border-line bg-surface">
            {rows.map((row) => {
              const outdated = row.mod.currentVersionId !== null && row.version?.id !== row.mod.currentVersionId;
              return (
                <li key={row.modId} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <Link href={`/mod/${row.mod.slug}`} className="font-semibold hover:text-amber">{row.mod.title}</Link>
                    <p className="font-mono text-xs text-muted">
                      {d.downloaded} {row.version ? `v${row.version.version.replace(/^v/i, "")}` : "—"} · {formatDate(locale, row.lastDownloadAt)}
                    </p>
                  </div>
                  {outdated && row.mod.currentVersion && (
                    <Link
                      href={`/mod/${row.mod.slug}#subory`}
                      className="inline-flex h-8 items-center gap-1.5 rounded-[5px] bg-amber px-2.5 text-xs font-semibold text-amber-ink hover:bg-amber-hover"
                    >
                      <Download size={13} aria-hidden /> {d.update.replace("{version}", row.mod.currentVersion.version.replace(/^v/i, ""))}
                    </Link>
                  )}
                  <form action={toggleDownloadNotifyAction}>
                    <input type="hidden" name="modId" value={row.modId} />
                    <button
                      type="submit"
                      aria-pressed={row.notifyUpdates}
                      title={row.notifyUpdates ? d.notifyOn : d.notifyOff}
                      className="inline-flex size-8 items-center justify-center rounded-[5px] border border-line text-muted hover:bg-raised hover:text-text"
                    >
                      {row.notifyUpdates ? <Bell size={14} aria-hidden /> : <BellOff size={14} aria-hidden />}
                      <span className="sr-only">{row.notifyUpdates ? d.notifyOn : d.notifyOff}</span>
                    </button>
                  </form>
                  <form action={removeDownloadHistoryAction}>
                    <input type="hidden" name="modId" value={row.modId} />
                    <button type="submit" title={d.remove} className="inline-flex size-8 items-center justify-center rounded-[5px] border border-line text-muted hover:bg-raised hover:text-alert">
                      <Trash2 size={14} aria-hidden />
                      <span className="sr-only">{d.remove}</span>
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
