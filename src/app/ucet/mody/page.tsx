import type { Metadata } from "next";
import Link from "next/link";
import { Download, Plus, Star } from "lucide-react";
import { startNewVersionAction } from "@/app/actions/wizard";
import { EmptyState } from "@/components/catalog/section-heading";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { getDictionary } from "@/i18n/server";
import { db } from "@/lib/db";
import { formatDate, formatNumber } from "@/lib/format";
import { requirePageUser } from "@/server/session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return { title: t.studio.myMods, robots: { index: false } };
}

export default async function MyModsPage() {
  const user = await requirePageUser("/ucet/mody");
  const { locale, t } = await getDictionary();
  const mods = await db().mod.findMany({
    where: { authorId: user.id, status: { not: "REMOVED" } },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      updatedAt: true,
      downloadCount: true,
      ratingAvg: true,
      ratingCount: true,
      currentVersionId: true,
      currentVersion: { select: { version: true } },
      versions: {
        where: { status: { in: ["DRAFT", "PENDING_REVIEW", "CHANGES_REQUESTED"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { version: true, status: true },
      },
      moderation: { where: { decision: "CHANGES_REQUESTED" }, orderBy: { createdAt: "desc" }, take: 1, select: { comment: true } },
    },
  });

  return (
    <>
      <SiteHeader />
      <main id="obsah" className="mx-auto max-w-[1000px] space-y-5 px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">{t.studio.myMods}</h1>
          <Link href="/nahrat" className="inline-flex h-9 items-center gap-1.5 rounded-[5px] bg-amber px-3 text-sm font-semibold text-amber-ink hover:bg-amber-hover">
            <Plus size={15} aria-hidden /> {t.studio.newMod}
          </Link>
        </div>
        {mods.length === 0 ? (
          <EmptyState>{t.studio.empty}</EmptyState>
        ) : (
          <ul className="divide-y divide-line rounded-[5px] border border-line bg-surface">
            {mods.map((mod) => {
              const working = mod.versions[0];
              const feedback = mod.moderation[0]?.comment;
              return (
                <li key={mod.id} className="space-y-2 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="led-tag">{t.studio.status[mod.status]}</span>
                    <span className="min-w-0 flex-1 truncate font-semibold">{mod.title}</span>
                    <span className="inline-flex items-center gap-3 font-mono text-xs text-muted">
                      {mod.currentVersion && <span>v{mod.currentVersion.version}</span>}
                      <span className="inline-flex items-center gap-1"><Download size={11} aria-hidden />{formatNumber(locale, mod.downloadCount)}</span>
                      {mod.ratingCount > 0 && <span className="inline-flex items-center gap-1"><Star size={11} aria-hidden />{mod.ratingAvg.toFixed(1)}</span>}
                      <span>{formatDate(locale, mod.updatedAt)}</span>
                    </span>
                  </div>
                  {working && (
                    <p className="font-mono text-xs text-muted">
                      v{working.version}: {t.studio.versionStatus[working.status]}
                    </p>
                  )}
                  {feedback && <p className="rounded-[3px] border border-amber/40 bg-amber-soft px-2 py-1 text-xs">{feedback}</p>}
                  <div className="flex flex-wrap gap-2">
                    {mod.status !== "PENDING_REVIEW" && (
                      <Link href={`/nahrat/${mod.id}`} className="inline-flex h-8 items-center rounded-[5px] border border-line px-3 text-xs hover:bg-raised">{t.studio.continue}</Link>
                    )}
                    <Link href={`/mod/${mod.slug}`} className="inline-flex h-8 items-center rounded-[5px] border border-line px-3 text-xs hover:bg-raised">{t.studio.view}</Link>
                    {mod.status !== "PENDING_REVIEW" && (
                      <Link href={`/nahrat/${mod.id}/vydanie`} className="inline-flex h-8 items-center rounded-[5px] border border-line px-3 text-xs hover:bg-raised">{t.studioPlan.link}</Link>
                    )}
                    {mod.currentVersionId && !working && (
                      <form action={startNewVersionAction}>
                        <input type="hidden" name="modId" value={mod.id} />
                        <button type="submit" className="inline-flex h-8 items-center gap-1 rounded-[5px] border border-amber/60 px-3 text-xs font-semibold hover:bg-amber-soft">
                          <Plus size={13} aria-hidden /> {t.modPage.newVersion}
                        </button>
                      </form>
                    )}
                  </div>
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
