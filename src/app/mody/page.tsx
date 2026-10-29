import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Search, SlidersHorizontal } from "lucide-react";
import { AutoSubmitForm } from "@/components/catalog/auto-submit-form";
import { ModCard } from "@/components/catalog/mod-card";
import { EmptyState, SectionHeading } from "@/components/catalog/section-heading";
import { CategoryStrip } from "@/components/layout/category-strip";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { getDictionary } from "@/i18n/server";
import { formatNumber, plural } from "@/lib/format";
import { categoryFacets } from "@/server/mods/reference-data";
import {
  SEARCH_PAGE_SIZE,
  SORT_OPTIONS,
  findCategoryBySlug,
  getCatalogFacets,
  searchMods,
  type SortOption,
} from "@/server/catalog";

export const dynamic = "force-dynamic";

const slugParam = z.string().regex(/^[a-z0-9-]{1,64}$/).optional().catch(undefined);
const paramsSchema = z.object({
  q: z.string().trim().max(100).catch(""),
  kategoria: slugParam,
  podkategoria: slugParam,
  znacka: slugParam,
  dopravca: slugParam,
  bez4gb: z.literal("1").optional().catch(undefined),
  zoradit: z.enum(SORT_OPTIONS).optional().catch(undefined),
  strana: z.coerce.number().int().min(1).max(1000).catch(1),
});

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Parsed = z.infer<typeof paramsSchema>;

async function parse(searchParams: SearchParams): Promise<Parsed> {
  const raw = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return paramsSchema.parse({
    q: first(raw.q) ?? "",
    kategoria: first(raw.kategoria) || undefined,
    podkategoria: first(raw.podkategoria) || undefined,
    znacka: first(raw.znacka) || undefined,
    dopravca: first(raw.dopravca) || undefined,
    bez4gb: first(raw.bez4gb),
    zoradit: first(raw.zoradit) || undefined,
    strana: first(raw.strana) ?? 1,
  });
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const { locale, t } = await getDictionary();
  const params = await parse(searchParams);
  const category = params.kategoria ? await findCategoryBySlug(params.kategoria) : null;
  const name = category ? (locale === "cs" ? category.nameCs : category.nameSk) : t.search.title;
  return {
    title: params.q ? `${t.search.resultsFor} „${params.q}“` : name,
    robots: { index: !params.q && !params.znacka && !params.dopravca, follow: true },
  };
}

function FilterSelect({
  name,
  label,
  value,
  options,
  anyLabel,
}: {
  name: string;
  label: string;
  value: string | undefined;
  options: { slug: string; name: string }[];
  anyLabel: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted">{label}</span>
      <select
        name={name}
        defaultValue={value ?? ""}
        className="h-9 w-full rounded-[5px] border border-line bg-bg px-2 text-sm outline-none focus:border-amber"
      >
        <option value="">{anyLabel}</option>
        {options.map((o) => (
          <option key={o.slug} value={o.slug}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export default async function CatalogPage({ searchParams }: { searchParams: SearchParams }) {
  const { locale, t } = await getDictionary();
  const params = await parse(searchParams);

  const category = params.kategoria ? await findCategoryBySlug(params.kategoria) : null;
  if (params.kategoria && !category) notFound();

  const facets = await getCatalogFacets(locale, category?.id ?? null);
  const subcategory = facets.subcategories.find((s) => s.slug === params.podkategoria) ?? null;
  const brand = facets.brands.find((b) => b.slug === params.znacka) ?? null;
  const operator = facets.operators.find((o) => o.slug === params.dopravca) ?? null;
  const shownFacets = categoryFacets(params.kategoria);

  const { items, total } = await searchMods(locale, {
    query: params.q,
    categoryId: category?.id ?? null,
    subcategoryId: subcategory?.id ?? null,
    brandId: brand?.id ?? null,
    operatorId: operator?.id ?? null,
    without4gb: params.bez4gb === "1",
    sort: (params.zoradit as SortOption | undefined) ?? null,
    page: params.strana,
  });
  const pages = Math.max(1, Math.ceil(total / SEARCH_PAGE_SIZE));

  const pageHref = (page: number) => {
    const qs = new URLSearchParams();
    for (const key of ["q", "kategoria", "podkategoria", "znacka", "dopravca", "bez4gb", "zoradit"] as const) {
      const value = params[key];
      if (value) qs.set(key, value);
    }
    if (page > 1) qs.set("strana", String(page));
    const s = qs.toString();
    return s ? `/mody?${s}` : "/mody";
  };

  const resetQs = new URLSearchParams();
  if (params.q) resetQs.set("q", params.q);
  if (params.kategoria) resetQs.set("kategoria", params.kategoria);
  const resetHref = resetQs.size > 0 ? `/mody?${resetQs.toString()}` : "/mody";

  const heading = category ? (locale === "cs" ? category.nameCs : category.nameSk) : t.search.title;
  const hasFilters = Boolean(params.podkategoria || params.znacka || params.dopravca || params.bez4gb || params.zoradit);
  const sortLabels: Record<SortOption, string> = {
    najnovsie: t.catalog.sortNewest,
    aktualizovane: t.catalog.sortUpdated,
    stiahnutia: t.catalog.sortDownloads,
    hodnotenie: t.catalog.sortRating,
    nazov: t.catalog.sortTitle,
  };

  return (
    <>
      <SiteHeader query={params.q} />
      <CategoryStrip activeSlug={params.kategoria ?? null} />
      <main id="obsah" className="mx-auto grid max-w-[1320px] gap-6 px-4 pt-6 lg:grid-cols-[240px_1fr]">
        <aside aria-labelledby="filters-heading">
          <AutoSubmitForm className="space-y-3 rounded-[5px] border border-line bg-surface p-3 lg:sticky lg:top-20">
            <h2 id="filters-heading" className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
              <SlidersHorizontal size={15} strokeWidth={1.75} className="text-amber" aria-hidden />
              {t.catalog.filters}
            </h2>
            {params.q && <input type="hidden" name="q" value={params.q} />}
            {params.kategoria && <input type="hidden" name="kategoria" value={params.kategoria} />}
            {facets.subcategories.length > 0 && (
              <FilterSelect name="podkategoria" label={t.catalog.subcategory} value={params.podkategoria} options={facets.subcategories} anyLabel={t.catalog.any} />
            )}
            {shownFacets.includes("brand") && (
              <FilterSelect name="znacka" label={t.catalog.brand} value={params.znacka} options={facets.brands} anyLabel={t.catalog.any} />
            )}
            {shownFacets.includes("operator") && (
              <FilterSelect name="dopravca" label={t.catalog.operator} value={params.dopravca} options={facets.operators} anyLabel={t.catalog.any} />
            )}
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted">{t.catalog.sort}</span>
              <select
                name="zoradit"
                defaultValue={params.zoradit ?? ""}
                className="h-9 w-full rounded-[5px] border border-line bg-bg px-2 text-sm outline-none focus:border-amber"
              >
                <option value="">{params.q ? t.catalog.sortRelevance : t.catalog.sortNewest}</option>
                {SORT_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {sortLabels[option]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="bez4gb" value="1" defaultChecked={params.bez4gb === "1"} className="size-4 accent-[var(--amber)]" />
              {t.catalog.only4gb}
            </label>
            <div className="flex items-center gap-2 pt-1">
              <button type="submit" className="h-8 rounded-[5px] bg-amber px-3 text-xs font-semibold text-amber-ink hover:bg-amber-hover">
                {t.catalog.apply}
              </button>
              {hasFilters && (
                <Link
                  href={resetHref}
                  className="text-xs text-muted underline-offset-2 hover:text-text hover:underline"
                >
                  {t.catalog.reset}
                </Link>
              )}
            </div>
          </AutoSubmitForm>
        </aside>

        <section aria-labelledby="catalog">
          <SectionHeading id="catalog" title={heading} Icon={Search}>
            <span className="font-mono text-xs text-muted">
              {params.q && (
                <>
                  {t.search.resultsFor} „<span className="text-text">{params.q}</span>“ ·{" "}
                </>
              )}
              {formatNumber(locale, total)} {plural(locale, total, t.search.results)}
            </span>
          </SectionHeading>

          {items.length === 0 ? (
            <EmptyState>{t.search.noResults}</EmptyState>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((mod) => (
                <ModCard key={mod.id} mod={mod} locale={locale} t={t} />
              ))}
            </div>
          )}

          {pages > 1 && (
            <nav className="mt-6 flex items-center justify-center gap-2 font-mono text-xs" aria-label={t.search.page}>
              {params.strana > 1 && (
                <Link href={pageHref(params.strana - 1)} className="rounded-[5px] border border-line px-3 py-1.5 hover:bg-raised">
                  ← {t.search.previous}
                </Link>
              )}
              <span className="px-2 text-muted">
                {t.search.page} {params.strana} / {pages}
              </span>
              {params.strana < pages && (
                <Link href={pageHref(params.strana + 1)} className="rounded-[5px] border border-line px-3 py-1.5 hover:bg-raised">
                  {t.search.next} →
                </Link>
              )}
            </nav>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
