import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { categoryIcon } from "@/lib/category-icons";
import { formatNumber, plural } from "@/lib/format";
import { getDictionary } from "@/i18n/server";
import { getCategoriesWithCounts } from "@/server/catalog";

export async function CategoryStrip({ activeSlug = null }: { activeSlug?: string | null }) {
  const { locale, t } = await getDictionary();
  const categories = await getCategoriesWithCounts(locale);
  const total = categories.reduce((sum, c) => sum + c.count, 0);

  const items = [
    { slug: null, name: t.categories.all, count: total, Icon: LayoutGrid },
    ...categories.map((c) => ({ slug: c.slug, name: c.name, count: c.count, Icon: categoryIcon(c.icon) })),
  ];

  return (
    <nav aria-label={t.categories.stripLabel} className="border-b border-line bg-surface">
      <ul className="scrollbar-thin mx-auto flex max-w-[1320px] gap-1 overflow-x-auto px-4 py-2">
        {items.map(({ slug, name, count, Icon }) => {
          const active = slug === activeSlug;
          const href = slug ? `/mody?kategoria=${encodeURIComponent(slug)}` : "/mody";
          return (
            <li key={slug ?? "all"} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={[
                  "group flex h-10 items-center gap-2 rounded-[5px] border px-3 text-sm transition-colors",
                  active
                    ? "border-amber bg-amber-soft text-text"
                    : "border-transparent text-muted hover:border-line hover:bg-raised hover:text-text",
                ].join(" ")}
              >
                <Icon size={16} strokeWidth={1.75} className={active ? "text-amber" : ""} aria-hidden />
                <span className="font-medium text-text">{name}</span>
                <span
                  className="font-mono text-xs tabular-nums text-muted"
                  title={`${formatNumber(locale, count)} ${plural(locale, count, t.categories.files)}`}
                >
                  {formatNumber(locale, count)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
