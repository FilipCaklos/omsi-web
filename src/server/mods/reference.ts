import "server-only";
import type { AppLocale } from "@/i18n/config";
import { db } from "@/lib/db";
import { ensureReferenceData } from "./reference-data";

/** Číselníky pre formuláre. Na úplne prázdnej DB ich najprv doplní (prvé spustenie bez seedu). */
export async function getReference(locale: AppLocale) {
  if ((await db().category.count()) === 0) await ensureReferenceData(db());
  const [categories, brands, operators, dlcs] = await Promise.all([
    db().category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, nameSk: true, nameCs: true, subcategories: { orderBy: { sortOrder: "asc" }, select: { id: true, nameSk: true, nameCs: true } } },
    }),
    db().vehicleBrand.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    db().operator.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    db().steamDlc.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const name = (r: { nameSk: string; nameCs: string }) => (locale === "cs" ? r.nameCs : r.nameSk);
  return {
    categories: categories.map((c) => ({ id: c.id, name: name(c), subcategories: c.subcategories.map((s) => ({ id: s.id, name: name(s) })) })),
    brands,
    operators,
    dlcs,
  };
}
