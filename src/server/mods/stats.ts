import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

export const STATS_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type DailyPoint = { day: string; count: number };

/**
 * Stiahnutia po dňoch (deduplikované DownloadEvent, uchovávané 90 dní) pre vybrané mody.
 * Dni bez stiahnutí sa doplnia nulou, aby graf nemal diery.
 */
export async function dailyDownloads(modIds: string[], days = STATS_DAYS, now = new Date()): Promise<DailyPoint[]> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (days - 1) * DAY_MS);
  const rows =
    modIds.length === 0
      ? []
      : await db().$queryRaw<{ day: Date; count: number }[]>`
          SELECT date_trunc('day', "createdAt")::date AS day, COUNT(*)::int AS count
          FROM "DownloadEvent"
          WHERE "modId" IN (${Prisma.join(modIds)}) AND "createdAt" >= ${start}
          GROUP BY 1 ORDER BY 1`;
  const byDay = new Map(rows.map((r) => [new Date(r.day).toISOString().slice(0, 10), Number(r.count)]));
  return Array.from({ length: days }, (_, i) => {
    const day = new Date(start.getTime() + i * DAY_MS).toISOString().slice(0, 10);
    return { day, count: byDay.get(day) ?? 0 };
  });
}

export type ModStatsRow = {
  id: string;
  slug: string;
  title: string;
  total: number;
  last7: number;
  last30: number;
  ratingAvg: number;
  ratingCount: number;
  followers: number;
};

/** Prehľad modov autora: celkovo, za 7 a 30 dní, hodnotenie, sledujúci. */
export async function authorModStats(authorId: string, now = new Date()): Promise<ModStatsRow[]> {
  const mods = await db().mod.findMany({
    where: { authorId, status: { in: ["PUBLISHED", "HIDDEN", "PLANNED", "SCHEDULED"] } },
    orderBy: { downloadCount: "desc" },
    select: { id: true, slug: true, title: true, downloadCount: true, ratingAvg: true, ratingCount: true, followerCount: true },
  });
  if (mods.length === 0) return [];
  const ids = mods.map((m) => m.id);
  const [week, month] = await Promise.all(
    [7, 30].map((days) =>
      db().downloadEvent.groupBy({
        by: ["modId"],
        where: { modId: { in: ids }, createdAt: { gte: new Date(now.getTime() - days * DAY_MS) } },
        _count: { _all: true },
      }),
    ),
  );
  const count = (rows: typeof week, id: string) => rows?.find((r) => r.modId === id)?._count._all ?? 0;
  return mods.map((m) => ({
    id: m.id,
    slug: m.slug,
    title: m.title,
    total: m.downloadCount,
    last7: count(week, m.id),
    last30: count(month, m.id),
    ratingAvg: m.ratingAvg,
    ratingCount: m.ratingCount,
    followers: m.followerCount,
  }));
}
