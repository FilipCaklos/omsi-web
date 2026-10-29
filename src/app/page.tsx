import Link from "next/link";
import { CalendarClock, Clock, Download, RefreshCw, Sparkles, TrendingUp, Wrench } from "lucide-react";
import { CategoryStrip } from "@/components/layout/category-strip";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { FileMeta, ModBadges, ModCard, ModThumb } from "@/components/catalog/mod-card";
import { RankingTabs } from "@/components/catalog/ranking-tabs";
import { EmptyState, SectionHeading } from "@/components/catalog/section-heading";
import { UpcomingCard } from "@/components/catalog/upcoming-card";
import type { AppLocale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/sk";
import { getDictionary } from "@/i18n/server";
import { formatDate, formatNumber } from "@/lib/format";
import {
  getFeaturedMods,
  getLatestMods,
  getMostDownloaded7Days,
  getMostDownloadedAllTime,
  getRecentUpdates,
  getUpcomingReleases,
  type ModCardData,
} from "@/server/catalog";

export const dynamic = "force-dynamic";

function FeaturedRow({ mod, locale, t }: { mod: ModCardData; locale: AppLocale; t: Dictionary }) {
  return (
    <article className="grid overflow-hidden rounded-[5px] border border-line bg-surface sm:grid-cols-[280px_1fr]">
      <Link href={`/mod/${mod.slug}`} tabIndex={-1} aria-hidden>
        <ModThumb imageId={mod.imageId} alt="" label={t.mod.noScreenshot} />
      </Link>
      <div className="flex flex-col gap-2 p-4">
        <span className="led-tag self-start">{mod.categoryName}</span>
        <h3 className="text-lg font-bold leading-snug">
          <Link href={`/mod/${mod.slug}`} className="hover:text-amber">
            {mod.title}
          </Link>
        </h3>
        <p className="line-clamp-2 text-sm text-muted">{mod.summary}</p>
        <ModBadges mod={mod} t={t} />
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-1">
          <FileMeta mod={mod} locale={locale} />
          <Link
            href={`/mod/${mod.slug}#subory`}
            className="inline-flex h-9 items-center gap-1.5 rounded-[5px] bg-amber px-3.5 text-sm font-semibold text-amber-ink hover:bg-amber-hover"
          >
            <Download size={16} strokeWidth={2.25} aria-hidden />
            {t.mod.download}
          </Link>
        </div>
      </div>
    </article>
  );
}

function RankingList({
  items,
  locale,
  t,
  empty,
}: {
  items: { mod: ModCardData; count: number }[];
  locale: AppLocale;
  t: Dictionary;
  empty: string;
}) {
  if (items.length === 0) return <EmptyState>{empty}</EmptyState>;
  return (
    <ol className="divide-y divide-line rounded-[5px] border border-line bg-surface">
      {items.map(({ mod, count }, index) => (
        <li key={mod.id} className="flex items-center gap-3 px-3 py-2">
          <span className="w-5 shrink-0 text-right font-mono text-xs text-muted">{index + 1}</span>
          <div className="min-w-0 flex-1">
            <Link href={`/mod/${mod.slug}`} className="block truncate text-sm font-medium hover:text-amber">
              {mod.title}
            </Link>
            <span className="text-[11px] text-muted">{mod.categoryName}</span>
          </div>
          <span className="shrink-0 font-mono text-xs tabular-nums text-text" title={t.mod.downloads}>
            {formatNumber(locale, count)}
          </span>
        </li>
      ))}
    </ol>
  );
}

export default async function HomePage() {
  const { locale, t } = await getDictionary();
  const [featured, latest, updates, top7, topAll, upcoming] = await Promise.all([
    getFeaturedMods(locale),
    getLatestMods(locale, 12),
    getRecentUpdates(locale, 8),
    getMostDownloaded7Days(locale, 8),
    getMostDownloadedAllTime(locale, 8),
    getUpcomingReleases(locale, 6),
  ]);
  const now = Date.now();

  return (
    <>
      <SiteHeader />
      <CategoryStrip />

      <main id="obsah" className="mx-auto max-w-[1320px] space-y-10 px-4 pt-6">
        {featured.length > 0 && (
          <section aria-labelledby="featured">
            <SectionHeading id="featured" title={t.home.featured} Icon={Sparkles} />
            <div className="grid gap-3 lg:grid-cols-2">
              {featured.map((mod) => (
                <FeaturedRow key={mod.id} mod={mod} locale={locale} t={t} />
              ))}
            </div>
          </section>
        )}

        <div className="grid gap-10 lg:grid-cols-[1fr_340px]">
          <section aria-labelledby="latest">
            <SectionHeading id="latest" title={t.home.latest} Icon={Clock} href="/mody" linkLabel={t.home.showAll} />
            {latest.length === 0 ? (
              <EmptyState>{t.home.emptyLatest}</EmptyState>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {latest.map((mod) => (
                  <ModCard key={mod.id} mod={mod} locale={locale} t={t} />
                ))}
              </div>
            )}
          </section>

          <aside className="space-y-10">
            <section aria-labelledby="updates">
              <SectionHeading id="updates" title={t.home.updates} Icon={RefreshCw} />
              {updates.length === 0 ? (
                <EmptyState>{t.home.emptyUpdates}</EmptyState>
              ) : (
                <ul className="divide-y divide-line rounded-[5px] border border-line bg-surface">
                  {updates.map((u) => (
                    <li key={u.versionId} className="px-3 py-2">
                      <Link href={`/mod/${u.mod.slug}#subory`} className="block truncate text-sm font-medium hover:text-amber">
                        {u.mod.title}
                      </Link>
                      <div className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-muted">
                        <span className="text-text">v{u.version.replace(/^v/i, "")}</span>
                        {u.hasPatch ? (
                          <span className="inline-flex items-center gap-0.5 rounded-[3px] bg-amber-soft px-1 text-amber">
                            <Wrench size={10} strokeWidth={2.25} aria-hidden />
                            {t.mod.patch}
                          </span>
                        ) : (
                          <span>{t.mod.newVersion}</span>
                        )}
                        <span className="ml-auto">{formatDate(locale, u.publishedAt)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="top">
              <SectionHeading id="top" title={t.home.mostDownloaded} Icon={TrendingUp} />
              <RankingTabs
                labels={[t.home.period7d, t.home.periodAll]}
                panels={[
                  <RankingList
                    key="7d"
                    items={top7.map((m) => ({ mod: m, count: m.periodDownloads }))}
                    locale={locale}
                    t={t}
                    empty={t.home.emptyMostDownloaded}
                  />,
                  <RankingList
                    key="all"
                    items={topAll.map((m) => ({ mod: m, count: m.downloadCount }))}
                    locale={locale}
                    t={t}
                    empty={t.home.emptyMostDownloaded}
                  />,
                ]}
              />
            </section>
          </aside>
        </div>

        <section aria-labelledby="upcoming">
          <SectionHeading
            id="upcoming"
            title={t.home.upcoming}
            Icon={CalendarClock}
            href="/pripravovane"
            linkLabel={t.home.showAll}
          />
          {upcoming.length === 0 ? (
            <EmptyState>{t.home.emptyUpcoming}</EmptyState>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {upcoming.map((entry) => (
                <UpcomingCard key={entry.slug} entry={entry} locale={locale} t={t} now={now} />
              ))}
            </div>
          )}
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
