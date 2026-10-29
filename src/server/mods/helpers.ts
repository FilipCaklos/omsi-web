import "server-only";
import { db } from "@/lib/db";

/** URL slug bez diakritiky: „Štrbské Pleso – Poprad“ → „strbske-pleso-poprad“. */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "") || "modifikacia";
}

export async function uniqueModSlug(title: string, excludeId?: string): Promise<string> {
  const base = slugify(title);
  for (let n = 1; n < 500; n += 1) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const existing = await db().mod.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!existing || existing.id === excludeId) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * Doplnkový text pre vyhľadávanie (kategória, podkategória, značky, dopravcovia v SK aj CS).
 * DB trigger z neho a z názvu/popisu vytvorí normalizovaný stĺpec searchText.
 */
export async function refreshSearchExtra(modId: string): Promise<void> {
  const mod = await db().mod.findUnique({
    where: { id: modId },
    select: {
      category: { select: { nameSk: true, nameCs: true } },
      subcategory: { select: { nameSk: true, nameCs: true } },
      brands: { select: { brand: { select: { name: true } } } },
      operators: { select: { operator: { select: { name: true, city: true } } } },
      author: { select: { name: true, username: true } },
    },
  });
  if (!mod) return;
  const parts = [
    mod.category.nameSk,
    mod.category.nameCs,
    mod.subcategory?.nameSk,
    mod.subcategory?.nameCs,
    mod.author.name,
    mod.author.username,
    ...mod.brands.map((b) => b.brand.name),
    ...mod.operators.flatMap((o) => [o.operator.name, o.operator.city ?? ""]),
  ].filter((p): p is string => Boolean(p));
  await db().mod.update({ where: { id: modId }, data: { searchExtra: [...new Set(parts)].join(" ").slice(0, 2000) } });
}

/** Najnovší verejne stiahnuteľný hlavný súbor pre zoznam modov (napr. závislosti). */
export async function mainFileIds(modIds: string[]): Promise<Map<string, string>> {
  if (modIds.length === 0) return new Map();
  const files = await db().modFile.findMany({
    where: {
      modId: { in: modIds },
      kind: "MAIN",
      scanStatus: "CLEAN",
      version: { status: "PUBLISHED" },
      mod: { status: "PUBLISHED" },
    },
    orderBy: [{ version: { publishedAt: "desc" } }, { sortOrder: "asc" }],
    select: { id: true, modId: true },
  });
  const result = new Map<string, string>();
  for (const file of files) if (!result.has(file.modId)) result.set(file.modId, file.id);
  return result;
}
