import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { DownloadsChart } from "@/components/account/downloads-chart";
import { EmptyState } from "@/components/catalog/section-heading";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { getDictionary } from "@/i18n/server";
import { formatNumber } from "@/lib/format";
import { STATS_DAYS, authorModStats, dailyDownloads } from "@/server/mods/stats";
import { requirePageUser } from "@/server/session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return { title: t.stats.title, robots: { index: false } };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Štatistiky autora: stiahnutia po dňoch (všetky mody alebo vybraný) a prehľad modov. */
export default async function StatsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requirePageUser("/ucet/statistiky");
  const [{ locale, t }, query] = await Promise.all([getDictionary(), searchParams]);
  const rows = await authorModStats(user.id);
  const selected = rows.find((r) => r.id === query.mod) ?? null;
  const points = await dailyDownloads(selected ? [selected.id] : rows.map((r) => r.id));
  const s = t.stats;
  const sum = (key: "total" | "last7" | "last30") => rows.reduce((acc, r) => acc + r[key], 0);

  return (
    <>
      <SiteHeader />
      <main id="obsah" className="mx-auto max-w-[1000px] space-y-6 px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <BarChart3 size={22} className="text-amber" aria-hidden /> {s.title}
          </h1>
          <Link href="/ucet/mody" className="text-sm text-muted hover:text-text">← {t.studio.myMods}</Link>
        </div>

        {rows.length === 0 ? (
          <EmptyState>{s.empty}</EmptyState>
        ) : (
          <>
            <dl className="grid gap-3 sm:grid-cols-3">
              {[
                [s.total, sum("total")],
                [s.last30, sum("last30")],
                [s.last7, sum("last7")],
              ].map(([label, value]) => (
                <div key={label} className="rounded-[5px] border border-line bg-surface p-4">
                  <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
                  <dd className="mt-1 font-mono text-3xl font-bold tabular-nums">{formatNumber(locale, Number(value))}</dd>
                </div>
              ))}
            </dl>

            <section className="space-y-3 rounded-[5px] border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Link href="/ucet/statistiky" className={`rounded-[5px] px-2.5 py-1 ${selected ? "text-muted hover:text-text" : "bg-raised"}`}>{s.allMods}</Link>
                {selected && <span className="rounded-[5px] bg-raised px-2.5 py-1">{selected.title}</span>}
              </div>
              <DownloadsChart points={points} locale={locale} label={s.chartLabel.replace("{days}", String(STATS_DAYS))} />
            </section>

            <div className="overflow-x-auto rounded-[5px] border border-line bg-surface">
              <table className="w-full text-sm">
                <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-2 font-medium">{s.mod}</th>
                    <th className="px-3 py-2 text-right font-medium">{s.total}</th>
                    <th className="px-3 py-2 text-right font-medium">{s.last30}</th>
                    <th className="px-3 py-2 text-right font-medium">{s.last7}</th>
                    <th className="px-3 py-2 text-right font-medium">{s.rating}</th>
                    <th className="px-4 py-2 text-right font-medium">{s.followers}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line font-mono tabular-nums">
                  {rows.map((row) => (
                    <tr key={row.id} className={row.id === selected?.id ? "bg-raised" : undefined}>
                      <td className="px-4 py-2 font-sans">
                        <Link href={`/ucet/statistiky?mod=${row.id}`} className="font-semibold hover:text-amber">{row.title}</Link>
                      </td>
                      <td className="px-3 py-2 text-right">{formatNumber(locale, row.total)}</td>
                      <td className="px-3 py-2 text-right">{formatNumber(locale, row.last30)}</td>
                      <td className="px-3 py-2 text-right">{formatNumber(locale, row.last7)}</td>
                      <td className="px-3 py-2 text-right">{row.ratingCount > 0 ? `${row.ratingAvg.toFixed(1)} (${row.ratingCount})` : "—"}</td>
                      <td className="px-4 py-2 text-right">{formatNumber(locale, row.followers)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted">{s.note}</p>
          </>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
