import Link from "next/link";
import { notFound } from "next/navigation";
import { saveCategoryFieldAction } from "@/app/actions/admin";
import { AdminAlert, AdminTitle, inputClass, primaryButtonClass, type AdminSearchParams } from "@/components/admin/admin-ui";
import type { CategoryField } from "@/generated/prisma/client";
import type { Dictionary } from "@/i18n/dictionaries/sk";
import { getDictionary } from "@/i18n/server";
import { FIELD_TYPES, FILTERABLE_TYPES, formatOptionLines, parseOptions } from "@/lib/category-fields";
import { db } from "@/lib/db";
import { requirePagePermission } from "@/server/session";

export const dynamic = "force-dynamic";

function FieldForm({ t, categoryId, field }: { t: Dictionary; categoryId: string; field: CategoryField | null }) {
  const c = t.admin.categories;
  const hasOptions = field === null || field.type === "SELECT" || field.type === "MULTISELECT";
  const canFilter = field === null || FILTERABLE_TYPES.includes(field.type);
  return (
    <form
      action={saveCategoryFieldAction}
      className={`grid gap-2 rounded-[5px] border bg-surface p-4 text-sm md:grid-cols-4 ${field && !field.isActive ? "border-dashed border-line opacity-70" : "border-line"}`}
    >
      <input type="hidden" name="categoryId" value={categoryId} />
      {field && <input type="hidden" name="fieldId" value={field.id} />}
      <input type="hidden" name="back" value={`/admin/kategorie/${categoryId}`} />
      <p className="font-semibold md:col-span-4">
        {field ? (
          <>
            {field.labelSk} <span className="font-mono text-xs text-muted">{field.key} · {c.types[field.type]}</span>
          </>
        ) : (
          c.addField
        )}
      </p>

      {!field && (
        <>
          <label className="space-y-1">
            <span className="block text-xs text-muted">{c.fieldKey}</span>
            <input name="key" required pattern="[a-z][a-z0-9_]{1,39}" title={c.fieldKeyHint} className={`${inputClass} w-full font-mono`} />
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-muted">{c.fieldType}</span>
            <select name="type" defaultValue="TEXT" className={`${inputClass} w-full`}>
              {FIELD_TYPES.map((type) => (
                <option key={type} value={type}>{c.types[type]}</option>
              ))}
            </select>
          </label>
          <p className="self-end pb-2 text-xs text-muted md:col-span-2">{c.fieldKeyHint}</p>
        </>
      )}

      <label className="space-y-1"><span className="block text-xs text-muted">{c.labelSk}</span><input name="labelSk" defaultValue={field?.labelSk} required maxLength={60} className={`${inputClass} w-full`} /></label>
      <label className="space-y-1"><span className="block text-xs text-muted">{c.labelCs}</span><input name="labelCs" defaultValue={field?.labelCs} required maxLength={60} className={`${inputClass} w-full`} /></label>
      <label className="space-y-1"><span className="block text-xs text-muted">{c.hintSk}</span><input name="hintSk" defaultValue={field?.hintSk} maxLength={160} className={`${inputClass} w-full`} /></label>
      <label className="space-y-1"><span className="block text-xs text-muted">{c.hintCs}</span><input name="hintCs" defaultValue={field?.hintCs} maxLength={160} className={`${inputClass} w-full`} /></label>

      {hasOptions && (
        <label className="space-y-1 md:col-span-4">
          <span className="block text-xs text-muted">{c.options}</span>
          <textarea
            name="options"
            rows={Math.max(3, Math.min(10, parseOptions(field?.options).length + 1))}
            defaultValue={field ? formatOptionLines(parseOptions(field.options)) : ""}
            className="w-full rounded-[5px] border border-line bg-bg px-2 py-1.5 font-mono text-xs outline-none focus:border-amber"
          />
          <span className="block text-xs text-muted">{c.optionsHint}</span>
        </label>
      )}

      <label className="space-y-1"><span className="block text-xs text-muted">{c.unit}</span><input name="unit" defaultValue={field?.unit} maxLength={12} className={`${inputClass} w-full`} /></label>
      <label className="space-y-1"><span className="block text-xs text-muted">{t.admin.categories.sortOrder}</span><input name="sortOrder" type="number" min={0} max={999} defaultValue={field?.sortOrder ?? 50} className={`${inputClass} w-full font-mono`} /></label>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 self-end pb-2 md:col-span-2">
        {field?.type !== "BOOLEAN" && (
          <label className="flex items-center gap-1.5"><input type="checkbox" name="required" defaultChecked={field?.required ?? false} className="accent-[var(--amber)]" />{c.required}</label>
        )}
        {canFilter && (
          <label className="flex items-center gap-1.5" title={c.filterableHint}>
            <input type="checkbox" name="filterable" defaultChecked={field?.filterable ?? false} className="accent-[var(--amber)]" />
            {c.filterable}
          </label>
        )}
        <label className="flex items-center gap-1.5"><input type="checkbox" name="isActive" defaultChecked={field?.isActive ?? true} className="accent-[var(--amber)]" />{c.fieldActive}</label>
        <button type="submit" className={`${primaryButtonClass} ml-auto`}>{c.save}</button>
      </div>
    </form>
  );
}

export default async function AdminCategoryFieldsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: AdminSearchParams }) {
  const { id } = await params;
  await requirePagePermission("category:manage", `/admin/kategorie/${id}`);
  const [{ locale, t }, query] = await Promise.all([getDictionary(), searchParams]);
  if (!/^[a-z0-9]{10,40}$/.test(id)) notFound();
  const category = await db().category.findUnique({
    where: { id },
    include: { fields: { orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }] } },
  });
  if (!category) notFound();
  const c = t.admin.categories;

  return (
    <>
      <Link href="/admin/kategorie" className="text-sm text-muted hover:text-text">{c.backToCategories}</Link>
      <AdminTitle>
        {c.fieldsTitle}: {locale === "cs" ? category.nameCs : category.nameSk}
      </AdminTitle>
      <p className="max-w-3xl text-sm text-muted">{c.fieldsIntro}</p>
      <AdminAlert t={t} params={query} okText={c.fieldSaved} />
      {category.fields.length === 0 && <p className="text-sm text-muted">{c.noFields}</p>}
      {category.fields.map((field) => (
        <FieldForm key={field.id} t={t} categoryId={category.id} field={field} />
      ))}
      <FieldForm t={t} categoryId={category.id} field={null} />
    </>
  );
}
