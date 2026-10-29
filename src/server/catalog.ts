import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { Attributes } from "@/lib/category-fields";
import { db } from "@/lib/db";
import type { AppLocale } from "@/i18n/config";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Polia potrebné pre kartu modu v katalógu. */
const modCardSelect = {
  id: true,
  slug: true,
  title: true,
  summary: true,
  downloadCount: true,
  ratingAvg: true,
  ratingCount: true,
  requires4GbPatch: true,
  publishedAt: true,
  lastUpdatedAt: true,
  author: { select: { username: true, name: true } },
  category: { select: { slug: true, nameSk: true, nameCs: true } },
  images: {
    where: { kind: "SCREENSHOT" },
    orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
    take: 1,
    select: { id: true, width: true, height: true },
  },
  currentVersion: { select: { version: true } },
  // Hlavný súbor môže byť v staršej verzii (aktuálna verzia môže obsahovať iba patch)
  files: {
    where: { kind: "MAIN", scanStatus: "CLEAN", version: { status: "PUBLISHED" } },
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { sizeBytes: true, extension: true },
  },
} satisfies Prisma.ModSelect;

type ModCardRow = Prisma.ModGetPayload<{ select: typeof modCardSelect }>;

export type ModCardData = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  authorName: string;
  categoryName: string;
  categorySlug: string;
  imageId: string | null;
  version: string | null;
  mainFileBytes: number | null;
  mainFileExt: string | null;
  downloadCount: number;
  ratingAvg: number;
  ratingCount: number;
  requires4GbPatch: boolean;
  publishedAt: Date | null;
};

function toCard(row: ModCardRow, locale: AppLocale): ModCardData {
  const mainFile = row.files[0];
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    authorName: row.author.name,
    categoryName: locale === "cs" ? row.category.nameCs : row.category.nameSk,
    categorySlug: row.category.slug,
    imageId: row.images[0]?.id ?? null,
    version: row.currentVersion?.version ?? null,
    mainFileBytes: mainFile ? Number(mainFile.sizeBytes) : null,
    mainFileExt: mainFile?.extension ?? null,
    downloadCount: row.downloadCount,
    ratingAvg: row.ratingAvg,
    ratingCount: row.ratingCount,
    requires4GbPatch: row.requires4GbPatch,
    publishedAt: row.publishedAt,
  };
}

export type CategoryWithCount = {
  id: string;
  slug: string;
  name: string;
  icon: string;
  count: number;
};

export async function getCategoriesWithCounts(locale: AppLocale): Promise<CategoryWithCount[]> {
  const categories = await db().category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      slug: true,
      nameSk: true,
      nameCs: true,
      icon: true,
      _count: { select: { mods: { where: { status: "PUBLISHED" } } } },
    },
  });
  return categories.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: locale === "cs" ? c.nameCs : c.nameSk,
    icon: c.icon,
    count: c._count.mods,
  }));
}

export async function getFeaturedMods(locale: AppLocale): Promise<ModCardData[]> {
  const now = new Date();
  const rows = await db().mod.findMany({
    where: {
      status: "PUBLISHED",
      isFeatured: true,
      OR: [{ featuredUntil: null }, { featuredUntil: { gt: now } }],
    },
    orderBy: { publishedAt: "desc" },
    take: 2,
    select: modCardSelect,
  });
  return rows.map((row) => toCard(row, locale));
}

export async function getLatestMods(locale: AppLocale, take = 12): Promise<ModCardData[]> {
  const rows = await db().mod.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    take,
    select: modCardSelect,
  });
  return rows.map((row) => toCard(row, locale));
}

export async function getModsByAuthor(locale: AppLocale, authorId: string): Promise<ModCardData[]> {
  const rows = await db().mod.findMany({
    where: { status: "PUBLISHED", OR: [{ authorId }, { credits: { some: { userId: authorId } } }] },
    orderBy: { publishedAt: "desc" },
    take: 60,
    select: modCardSelect,
  });
  return rows.map((row) => toCard(row, locale));
}

export async function getMostDownloadedAllTime(locale: AppLocale, take = 8): Promise<ModCardData[]> {
  const rows = await db().mod.findMany({
    where: { status: "PUBLISHED", downloadCount: { gt: 0 } },
    orderBy: [{ downloadCount: "desc" }, { publishedAt: "desc" }],
    take,
    select: modCardSelect,
  });
  return rows.map((row) => toCard(row, locale));
}

export type RankedMod = ModCardData & { periodDownloads: number };

/** Najsťahovanejšie za 7 dní – z deduplikovaných udalostí DownloadEvent. */
export async function getMostDownloaded7Days(locale: AppLocale, take = 8): Promise<RankedMod[]> {
  const since = new Date(Date.now() - 7 * DAY_MS);
  const grouped = await db().downloadEvent.groupBy({
    by: ["modId"],
    where: { createdAt: { gte: since }, mod: { status: "PUBLISHED" } },
    _count: { _all: true },
    orderBy: { _count: { modId: "desc" } },
    take,
  });
  if (grouped.length === 0) return [];
  const rows = await db().mod.findMany({
    where: { id: { in: grouped.map((g) => g.modId) } },
    select: modCardSelect,
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return grouped.flatMap((g) => {
    const row = byId.get(g.modId);
    return row ? [{ ...toCard(row, locale), periodDownloads: g._count._all }] : [];
  });
}

export type UpdateEntry = {
  versionId: string;
  version: string;
  publishedAt: Date;
  hasPatch: boolean;
  mod: { slug: string; title: string; categoryName: string };
};

/** Nové verzie a patche už vydaných modov (bez prvého vydania). */
export async function getRecentUpdates(locale: AppLocale, take = 8): Promise<UpdateEntry[]> {
  const versions = await db().modVersion.findMany({
    where: { status: "PUBLISHED", publishedAt: { not: null }, mod: { status: "PUBLISHED" } },
    orderBy: { publishedAt: "desc" },
    take: take * 3,
    select: {
      id: true,
      version: true,
      publishedAt: true,
      files: { where: { kind: "PATCH" }, select: { id: true }, take: 1 },
      mod: {
        select: {
          slug: true,
          title: true,
          publishedAt: true,
          category: { select: { nameSk: true, nameCs: true } },
        },
      },
    },
  });
  return versions
    .filter((v) => v.publishedAt && v.mod.publishedAt && v.publishedAt.getTime() - v.mod.publishedAt.getTime() > 60_000)
    .slice(0, take)
    .map((v) => ({
      versionId: v.id,
      version: v.version,
      publishedAt: v.publishedAt as Date,
      hasPatch: v.files.length > 0,
      mod: {
        slug: v.mod.slug,
        title: v.mod.title,
        categoryName: locale === "cs" ? v.mod.category.nameCs : v.mod.category.nameSk,
      },
    }));
}

export type UpcomingEntry = {
  slug: string;
  status: "PLANNED" | "SCHEDULED";
  title: string;
  summary: string;
  authorName: string;
  categoryName: string;
  imageId: string | null;
  followerCount: number;
  mode: "EXACT_DATE" | "WINDOW" | "TBA";
  releaseAt: Date | null;
  windowYear: number | null;
  windowPart: string | null;
  overallPercent: number | null;
};

const WINDOW_ORDER: Record<string, number> = {
  Q1: 1, SPRING: 1, H1: 2, Q2: 2, SUMMER: 3, Q3: 3, AUTUMN: 4, H2: 4, Q4: 4, WINTER: 4, YEAR: 4,
};

export async function getUpcomingReleases(locale: AppLocale, take = 6, categorySlug: string | null = null): Promise<UpcomingEntry[]> {
  const rows = await db().mod.findMany({
    where: {
      status: { in: ["PLANNED", "SCHEDULED"] },
      plannedRelease: { isNot: null },
      ...(categorySlug ? { category: { slug: categorySlug } } : {}),
    },
    select: {
      slug: true,
      status: true,
      title: true,
      summary: true,
      followerCount: true,
      author: { select: { name: true } },
      category: { select: { nameSk: true, nameCs: true } },
      images: {
        where: { kind: "SCREENSHOT" },
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
        take: 1,
        select: { id: true },
      },
      plannedRelease: {
        select: {
          mode: true,
          releaseAt: true,
          windowYear: true,
          windowPart: true,
          progress: { select: { percent: true } },
        },
      },
    },
  });

  const entries = rows.flatMap((row): UpcomingEntry[] => {
    const plan = row.plannedRelease;
    if (!plan) return [];
    const overall =
      plan.progress.length > 0
        ? Math.round(plan.progress.reduce((sum, p) => sum + p.percent, 0) / plan.progress.length)
        : null;
    return [
      {
        slug: row.slug,
        status: row.status === "SCHEDULED" ? "SCHEDULED" : "PLANNED",
        title: row.title,
        summary: row.summary,
        authorName: row.author.name,
        categoryName: locale === "cs" ? row.category.nameCs : row.category.nameSk,
        imageId: row.images[0]?.id ?? null,
        followerCount: row.followerCount,
        mode: plan.mode,
        releaseAt: plan.releaseAt,
        windowYear: plan.windowYear,
        windowPart: plan.windowPart,
        overallPercent: overall,
      },
    ];
  });

  // Najprv presné dátumy (najbližšie), potom okná podľa roka/časti, nakoniec TBA
  const sortKey = (e: UpcomingEntry): number => {
    if (e.mode === "EXACT_DATE" && e.releaseAt) return e.releaseAt.getTime();
    if (e.mode === "WINDOW" && e.windowYear) {
      return Date.UTC(e.windowYear, (WINDOW_ORDER[e.windowPart ?? "YEAR"] ?? 4) * 3 - 1, 28);
    }
    return Number.MAX_SAFE_INTEGER;
  };
  return entries.sort((a, b) => sortKey(a) - sortKey(b)).slice(0, take);
}

// ───────────────────────────── Vyhľadávanie bez diakritiky ─────────────────────────────

export const SEARCH_PAGE_SIZE = 24;
export const SORT_OPTIONS = ["najnovsie", "aktualizovane", "stiahnutia", "hodnotenie", "nazov"] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

/** Escapovanie zástupných znakov LIKE, aby používateľ nemohol vložiť vlastný vzor. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export type SearchFilters = {
  query: string;
  categoryId: string | null;
  subcategoryId: string | null;
  brandId: string | null;
  operatorId: string | null;
  without4gb: boolean;
  /** Filtre podľa parametrov kategórie (z parseAttributeFilters) – JSONB obsahovanie */
  attributes?: Attributes;
  sort: SortOption | null;
  page: number;
};

export type SearchResult = { items: ModCardData[]; total: number };

/**
 * Vyhľadávanie cez omsi_normalize() = lower(unaccent()) nad trigger-udržiavaným stĺpcom "searchText"
 * (GIN trigram index) + filtre katalógu. Všetky hodnoty idú výhradne ako parametre Prisma.sql.
 */
export async function searchMods(locale: AppLocale, filters: SearchFilters): Promise<SearchResult> {
  const query = filters.query.trim().slice(0, 100);
  const page = Math.max(1, Math.floor(filters.page));
  const offset = (page - 1) * SEARCH_PAGE_SIZE;

  const conditions: Prisma.Sql[] = [Prisma.sql`m."status" = 'PUBLISHED'`];
  if (filters.categoryId) conditions.push(Prisma.sql`m."categoryId" = ${filters.categoryId}`);
  if (filters.subcategoryId) conditions.push(Prisma.sql`m."subcategoryId" = ${filters.subcategoryId}`);
  if (filters.brandId) {
    conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM "ModBrand" mb WHERE mb."modId" = m."id" AND mb."brandId" = ${filters.brandId})`);
  }
  if (filters.operatorId) {
    conditions.push(
      Prisma.sql`EXISTS (SELECT 1 FROM "ModOperator" mo WHERE mo."modId" = m."id" AND mo."operatorId" = ${filters.operatorId})`,
    );
  }
  if (filters.without4gb) conditions.push(Prisma.sql`m."requires4GbPatch" = false`);
  for (const [key, value] of Object.entries(filters.attributes ?? {})) {
    // @> využije GIN index (jsonb_path_ops); pri MULTISELECT [hodnota] znamená „obsahuje túto možnosť“
    conditions.push(Prisma.sql`m."attributes" @> ${JSON.stringify({ [key]: value })}::jsonb`);
  }

  const terms = query.split(/\s+/).filter((t) => t.length > 0).slice(0, 6);
  for (const term of terms) {
    conditions.push(
      Prisma.sql`(m."searchText" LIKE '%' || omsi_normalize(${escapeLike(term)}) || '%' ESCAPE '\\'
        OR word_similarity(omsi_normalize(${term}), m."searchText") >= 0.45)`,
    );
  }
  const where = Prisma.join(conditions, " AND ");

  // Pri hľadaní je predvolené zoradenie podľa relevancie, inak najnovšie
  const sort = filters.sort ?? (query ? null : "najnovsie");
  const orderBy =
    sort === "aktualizovane" ? Prisma.sql`COALESCE(m."lastUpdatedAt", m."publishedAt") DESC NULLS LAST`
    : sort === "stiahnutia" ? Prisma.sql`m."downloadCount" DESC, m."publishedAt" DESC`
    : sort === "hodnotenie" ? Prisma.sql`m."ratingAvg" DESC, m."ratingCount" DESC`
    : sort === "nazov" ? Prisma.sql`omsi_normalize(m."title") ASC`
    : sort === "najnovsie" ? Prisma.sql`m."publishedAt" DESC NULLS LAST`
    : Prisma.sql`(omsi_normalize(m."title") LIKE omsi_normalize(${escapeLike(query)}) || '%' ESCAPE '\\') DESC,
        word_similarity(omsi_normalize(${query}), m."searchText") DESC, m."downloadCount" DESC`;

  const [rows, countRows] = await Promise.all([
    db().$queryRaw<{ id: string }[]>`
      SELECT m."id" FROM "Mod" m WHERE ${where}
      ORDER BY ${orderBy}, m."id"
      LIMIT ${SEARCH_PAGE_SIZE} OFFSET ${offset}`,
    db().$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::bigint AS count FROM "Mod" m WHERE ${where}`,
  ]);
  const ids = rows.map((r) => r.id);
  const total = Number(countRows[0]?.count ?? 0);

  if (ids.length === 0) return { items: [], total };
  const mods = await db().mod.findMany({ where: { id: { in: ids } }, select: modCardSelect });
  const byId = new Map(mods.map((m) => [m.id, m]));
  const items = ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [toCard(row, locale)] : [];
  });
  return { items, total };
}

export type SuggestItem = { slug: string; title: string; categoryName: string };

/** Rýchle návrhy pre vyhľadávanie v hlavičke (max. 6). */
export async function suggestMods(locale: AppLocale, query: string): Promise<SuggestItem[]> {
  const q = query.trim().slice(0, 60);
  if (q.length < 2) return [];
  const rows = await db().$queryRaw<{ slug: string; title: string; nameSk: string; nameCs: string }[]>`
    SELECT m."slug", m."title", c."nameSk", c."nameCs"
    FROM "Mod" m JOIN "Category" c ON c."id" = m."categoryId"
    WHERE m."status" = 'PUBLISHED'
      AND (m."searchText" LIKE '%' || omsi_normalize(${escapeLike(q)}) || '%' ESCAPE '\\'
        OR word_similarity(omsi_normalize(${q}), m."searchText") >= 0.5)
    ORDER BY (omsi_normalize(m."title") LIKE omsi_normalize(${escapeLike(q)}) || '%' ESCAPE '\\') DESC,
      word_similarity(omsi_normalize(${q}), m."searchText") DESC, m."downloadCount" DESC
    LIMIT 6`;
  return rows.map((r) => ({ slug: r.slug, title: r.title, categoryName: locale === "cs" ? r.nameCs : r.nameSk }));
}

export type CatalogFacets = {
  subcategories: { id: string; slug: string; name: string }[];
  brands: { id: string; slug: string; name: string }[];
  operators: { id: string; slug: string; name: string }[];
};

export async function getCatalogFacets(locale: AppLocale, categoryId: string | null): Promise<CatalogFacets> {
  const [subcategories, brands, operators] = await Promise.all([
    categoryId
      ? db().subcategory.findMany({ where: { categoryId }, orderBy: { sortOrder: "asc" }, select: { id: true, slug: true, nameSk: true, nameCs: true } })
      : Promise.resolve([]),
    db().vehicleBrand.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, slug: true, name: true } }),
    db().operator.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, slug: true, name: true } }),
  ]);
  return {
    subcategories: subcategories.map((s) => ({ id: s.id, slug: s.slug, name: locale === "cs" ? s.nameCs : s.nameSk })),
    brands,
    operators,
  };
}

export async function findCategoryBySlug(slug: string): Promise<{ id: string; nameSk: string; nameCs: string } | null> {
  return db().category.findFirst({
    where: { slug, isActive: true },
    select: { id: true, nameSk: true, nameCs: true },
  });
}

export async function getSiteTotals(): Promise<{ mods: number; files: number }> {
  const [mods, files] = await Promise.all([
    db().mod.count({ where: { status: "PUBLISHED" } }),
    db().modFile.count({ where: { scanStatus: "CLEAN", mod: { status: "PUBLISHED" } } }),
  ]);
  return { mods, files };
}
