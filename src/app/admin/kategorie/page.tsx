import { saveCategoryAction } from "@/app/actions/admin";
import { AdminAlert, AdminTitle, inputClass, primaryButtonClass, type AdminSearchParams } from "@/components/admin/admin-ui";
import type { Dictionary } from "@/i18n/dictionaries/sk";
import { getDictionary } from "@/i18n/server";
import { CATEGORY_ICONS, categoryIcon } from "@/lib/category-icons";
import { db } from "@/lib/db";
import { requirePagePermission } from "@/server/session";

export const dynamic = "force-dynamic";

type CategoryRow = {
  id: string; slug: string; nameSk: string; nameCs: string; descriptionSk: string; descriptionCs: string; icon: string; sortOrder: number; isActive: boolean;
};

function CategoryForm({ t, category }: { t: Dictionary; category: CategoryRow | null }) {
  const c = t.admin.categories;
  const Icon = categoryIcon(category?.icon ?? "map");
  return (
    <form action={saveCategoryAction} className="grid gap-2 rounded-[5px] border border-line bg-surface p-4 text-sm md:grid-cols-4">
      {category && <input type="hidden" name="categoryId" value={category.id} />}
      <input type="hidden" name="back" value="/admin/kategorie" />
      <p className="flex items-center gap-2 font-semibold md:col-span-4">
        <Icon size={16} className="text-amber" aria-hidden /> {category ? category.nameSk : c.create}
      </p>
      <label className="space-y-1"><span className="block text-xs text-muted">{c.slug}</span><input name="slug" defaultValue={category?.slug} required pattern="[a-z0-9-]{2,40}" className={`${inputClass} w-full font-mono`} /></label>
      <label className="space-y-1"><span className="block text-xs text-muted">{c.nameSk}</span><input name="nameSk" defaultValue={category?.nameSk} required maxLength={60} className={`${inputClass} w-full`} /></label>
      <label className="space-y-1"><span className="block text-xs text-muted">{c.nameCs}</span><input name="nameCs" defaultValue={category?.nameCs} required maxLength={60} className={`${inputClass} w-full`} /></label>
      <label className="space-y-1">
        <span className="block text-xs text-muted">{c.icon}</span>
        <select name="icon" defaultValue={category?.icon ?? "map"} className={`${inputClass} w-full`}>
          {Object.keys(CATEGORY_ICONS).map((key) => <option key={key} value={key}>{key}</option>)}
        </select>
      </label>
      <label className="space-y-1 md:col-span-2"><span className="block text-xs text-muted">{c.descriptionSk}</span><input name="descriptionSk" defaultValue={category?.descriptionSk} maxLength={300} className={`${inputClass} w-full`} /></label>
      <label className="space-y-1 md:col-span-2"><span className="block text-xs text-muted">{c.descriptionCs}</span><input name="descriptionCs" defaultValue={category?.descriptionCs} maxLength={300} className={`${inputClass} w-full`} /></label>
      <label className="space-y-1"><span className="block text-xs text-muted">{c.sortOrder}</span><input name="sortOrder" type="number" min={0} max={999} defaultValue={category?.sortOrder ?? 99} className={`${inputClass} w-full font-mono`} /></label>
      <label className="flex items-center gap-2 self-end pb-2"><input type="checkbox" name="isActive" defaultChecked={category?.isActive ?? true} className="accent-[var(--amber)]" />{c.active}</label>
      <div className="self-end md:col-span-2 md:justify-self-end"><button type="submit" className={primaryButtonClass}>{c.save}</button></div>
    </form>
  );
}

export default async function AdminCategoriesPage({ searchParams }: { searchParams: AdminSearchParams }) {
  await requirePagePermission("category:manage", "/admin/kategorie");
  const [{ t }, query] = await Promise.all([getDictionary(), searchParams]);
  const categories = await db().category.findMany({ orderBy: { sortOrder: "asc" } });
  return (
    <>
      <AdminTitle>{t.admin.nav.categories}</AdminTitle>
      <AdminAlert t={t} params={query} okText={t.admin.categories.saved} />
      {categories.map((category) => <CategoryForm key={category.id} t={t} category={category} />)}
      <CategoryForm t={t} category={null} />
    </>
  );
}
