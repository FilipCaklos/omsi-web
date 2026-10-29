import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { sk } from "@/i18n/dictionaries/sk";
import { buildRss } from "@/server/integrations/rss";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /feed.xml – posledných 50 zverejnených verzií (nové mody aj aktualizácie). */
export async function GET(): Promise<Response> {
  const base = env().APP_URL;
  const versions = await db().modVersion.findMany({
    where: { status: "PUBLISHED", publishedAt: { not: null }, mod: { status: "PUBLISHED" } },
    orderBy: { publishedAt: "desc" },
    take: 50,
    select: {
      id: true,
      version: true,
      publishedAt: true,
      mod: {
        select: {
          slug: true,
          title: true,
          summary: true,
          category: { select: { nameSk: true } },
          author: { select: { name: true } },
          images: { where: { kind: "SCREENSHOT" }, orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], take: 1, select: { id: true } },
        },
      },
    },
  });
  const xml = buildRss(
    { title: sk.meta.siteName, url: `${base}/`, description: sk.meta.description, feedUrl: `${base}/feed.xml` },
    versions.map((v) => ({
      title: `${v.mod.title} – v${v.version.replace(/^v/i, "")}`,
      url: `${base}/mod/${v.mod.slug}`,
      guid: v.id,
      description: v.mod.summary,
      category: v.mod.category.nameSk,
      author: v.mod.author.name,
      publishedAt: v.publishedAt ?? new Date(),
      imageUrl: v.mod.images[0] ? `${base}/api/media/${v.mod.images[0].id}?variant=full` : null,
    })),
  );
  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=600" },
  });
}
