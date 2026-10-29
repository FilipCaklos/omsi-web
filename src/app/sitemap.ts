import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Sitemap: katalóg, kategórie, pripravované a všetky verejné mody a profily autorov. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env().APP_URL;
  const [mods, categories, authors] = await Promise.all([
    db().mod.findMany({
      where: { status: { in: ["PUBLISHED", "PLANNED", "SCHEDULED"] } },
      select: {
        slug: true,
        updatedAt: true,
        status: true,
        images: { where: { kind: "SCREENSHOT" }, orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], take: 3, select: { id: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 20_000,
    }),
    db().category.findMany({ where: { isActive: true }, select: { slug: true, updatedAt: true } }),
    db().user.findMany({ where: { mods: { some: { status: "PUBLISHED" } }, bannedAt: null }, select: { username: true }, take: 5_000 }),
  ]);
  return [
    { url: `${base}/`, changeFrequency: "hourly", priority: 1 },
    { url: `${base}/mody`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${base}/pripravovane`, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/mapa`, changeFrequency: "weekly", priority: 0.6 },
    ...["/podmienky", "/ochrana-sukromia", "/kontakt"].map((path) => ({ url: `${base}${path}`, changeFrequency: "yearly" as const, priority: 0.2 })),
    ...categories.map((c) => ({ url: `${base}/mody?kategoria=${c.slug}`, lastModified: c.updatedAt, changeFrequency: "daily" as const, priority: 0.8 })),
    ...mods.map((m) => ({
      url: `${base}/mod/${m.slug}`,
      lastModified: m.updatedAt,
      changeFrequency: "weekly" as const,
      priority: m.status === "PUBLISHED" ? 0.8 : 0.5,
      images: m.images.map((i) => `${base}/api/media/${i.id}?variant=full`),
    })),
    ...authors.map((a) => ({ url: `${base}/autor/${a.username}`, changeFrequency: "weekly" as const, priority: 0.4 })),
  ];
}
