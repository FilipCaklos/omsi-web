import Link from "next/link";
import { Search, Star } from "lucide-react";
import { featureModAction, setModVisibilityAction } from "@/app/actions/admin";
import { AdminAlert, AdminTitle, buttonClass, dangerButtonClass, inputClass, param, type AdminSearchParams } from "@/components/admin/admin-ui";
import { getDictionary } from "@/i18n/server";
import { db } from "@/lib/db";
import { formatDate, formatNumber } from "@/lib/format";
import { can } from "@/lib/rbac";
import { requirePagePermission } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function AdminModsPage({ searchParams }: { searchParams: AdminSearchParams }) {
  const user = await requirePagePermission("content:hide", "/admin/mody");
  const [{ locale, t }, query] = await Promise.all([getDictionary(), searchParams]);
  const q = (param(query, "q") ?? "").trim().slice(0, 60);
  const mods = await db().mod.findMany({
    where: {
      status: { in: ["PUBLISHED", "HIDDEN", "PLANNED", "SCHEDULED"] },
      ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { slug: { contains: q.toLowerCase() } }, { author: { username: { contains: q.toLowerCase() } } }] } : {}),
    },
    orderBy: [{ isFeatured: "desc" }, { updatedAt: "desc" }],
    take: 60,
    select: {
      id: true, slug: true, title: true, status: true, isFeatured: true, featuredUntil: true, downloadCount: true, currentVersionId: true,
      author: { select: { username: true } },
    },
  });
  const m = t.admin.mods;
  const back = q ? `/admin/mody?q=${encodeURIComponent(q)}` : "/admin/mody";
  const canFeature = can(user.role, "mod:feature");

  return (
    <>
      <AdminTitle>{t.admin.nav.mods}</AdminTitle>
      <AdminAlert t={t} params={query} okText={t.admin.users.saved} />
      <form method="get" className="flex gap-2">
        <input name="q" defaultValue={q} placeholder={m.search} aria-label={m.search} className={`${inputClass} flex-1`} />
        <button type="submit" className={buttonClass}><Search size={14} aria-hidden /></button>
      </form>
      <ul className="divide-y divide-line rounded-[5px] border border-line bg-surface">
        {mods.map((mod) => (
          <li key={mod.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
            {mod.isFeatured && <Star size={14} className="fill-amber text-amber" aria-label={m.featured} />}
            <span className="min-w-0 flex-1">
              <Link href={`/mod/${mod.slug}`} className="font-semibold hover:text-amber">{mod.title}</Link>
              <span className="block font-mono text-[11px] text-muted">
                @{mod.author.username} · {t.studio.status[mod.status]} · {formatNumber(locale, mod.downloadCount)} {t.mod.downloads}
                {mod.featuredUntil && ` · ${m.featured} → ${formatDate(locale, mod.featuredUntil)}`}
              </span>
            </span>
            {canFeature && mod.status === "PUBLISHED" && (
              <form action={featureModAction} className="flex items-center gap-1.5">
                <input type="hidden" name="modId" value={mod.id} />
                <input type="hidden" name="back" value={back} />
                <input type="hidden" name="featured" value={mod.isFeatured ? "0" : "1"} />
                {!mod.isFeatured && <input type="date" name="until" aria-label={m.featuredUntil} title={m.featuredUntil} className={`${inputClass} w-36 font-mono`} />}
                <button type="submit" className={buttonClass}>{mod.isFeatured ? m.unfeature : m.feature}</button>
              </form>
            )}
            <form action={setModVisibilityAction} className="flex gap-1.5">
              <input type="hidden" name="modId" value={mod.id} />
              <input type="hidden" name="back" value={back} />
              {mod.status === "HIDDEN" ? (
                <button type="submit" name="visibility" value="show" className={buttonClass}>{m.unhide}</button>
              ) : (
                <button type="submit" name="visibility" value="hide" className={dangerButtonClass}>{m.hide}</button>
              )}
            </form>
          </li>
        ))}
      </ul>
    </>
  );
}
