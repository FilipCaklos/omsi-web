import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { EmptyState, SectionHeading } from "@/components/catalog/section-heading";
import { UpcomingCard } from "@/components/catalog/upcoming-card";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { getDictionary } from "@/i18n/server";
import { getCategoriesWithCounts, getUpcomingReleases } from "@/server/catalog";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return { title: t.planned.title, description: t.planned.intro };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function UpcomingPage({ searchParams }: { searchParams: SearchParams }) {
  const { locale, t } = await getDictionary();
  const raw = (await searchParams).kategoria;
  const categorySlug = typeof raw === "string" && /^[a-z0-9-]{1,64}$/.test(raw) ? raw : null;
  const [entries, categories] = await Promise.all([getUpcomingReleases(locale, 120, categorySlug), getCategoriesWithCounts(locale)]);
  const now = Date.now();

  return (
    <>
      <SiteHeader />
      <main id="obsah" className="mx-auto max-w-[1320px] space-y-5 px-4 pt-6">
        <SectionHeading id="planned" title={t.planned.title} Icon={CalendarClock} />
        <p className="-mt-2 max-w-2xl text-sm text-muted">{t.planned.intro}</p>

        <nav aria-label={t.catalog.filters} className="scrollbar-thin flex gap-1 overflow-x-auto">
          {[{ slug: null, name: t.planned.allCategories }, ...categories.map((c) => ({ slug: c.slug, name: c.name }))].map((c) => {
            const active = c.slug === categorySlug;
            return (
              <Link
                key={c.slug ?? "all"}
                href={c.slug ? `/pripravovane?kategoria=${c.slug}` : "/pripravovane"}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 rounded-[5px] border px-3 py-1.5 text-sm ${active ? "border-amber bg-amber-soft" : "border-line text-muted hover:bg-raised hover:text-text"}`}
              >
                {c.name}
              </Link>
            );
          })}
        </nav>

        {entries.length === 0 ? (
          <EmptyState>{t.planned.empty}</EmptyState>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {entries.map((entry) => (
              <UpcomingCard key={entry.slug} entry={entry} locale={locale} t={t} now={now} />
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
