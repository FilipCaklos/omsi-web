import type { Metadata } from "next";
import { MapPinned } from "lucide-react";
import { SectionHeading } from "@/components/catalog/section-heading";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { MapOfMaps } from "@/components/map/maps";
import { getDictionary } from "@/i18n/server";
import { readAttributes } from "@/lib/category-fields";
import { db } from "@/lib/db";
import { plural } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return { title: t.mapOfMaps.title, description: t.mapOfMaps.intro, alternates: { canonical: "/mapa" } };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Mapa máp – všetky zverejnené OMSI mapy s polohou na mape SK/CZ. */
export default async function MapOfMapsPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ locale, t }, query] = await Promise.all([getDictionary(), searchParams]);
  const mods = await db().mod.findMany({
    where: { status: { in: ["PUBLISHED", "PLANNED", "SCHEDULED"] }, mapLat: { not: null }, mapLng: { not: null } },
    orderBy: { downloadCount: "desc" },
    take: 2000,
    select: {
      slug: true,
      title: true,
      mapLat: true,
      mapLng: true,
      attributes: true,
      images: { where: { kind: "SCREENSHOT" }, orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], take: 1, select: { id: true } },
    },
  });
  const focus = typeof query.mod === "string" && /^[a-z0-9-]{1,90}$/.test(query.mod) ? query.mod : null;
  const pins = mods.map((m) => {
    const place = readAttributes(m.attributes).mesto;
    return {
      slug: m.slug,
      title: m.title,
      lat: m.mapLat ?? 0,
      lng: m.mapLng ?? 0,
      imageId: m.images[0]?.id ?? null,
      place: typeof place === "string" ? place : null,
    };
  });

  return (
    <>
      <SiteHeader />
      <main id="obsah" className="mx-auto max-w-[1320px] space-y-4 px-4 pt-6">
        <SectionHeading id="map-of-maps" title={t.mapOfMaps.title} Icon={MapPinned} />
        <p className="-mt-2 max-w-2xl text-sm text-muted">
          {t.mapOfMaps.intro} {t.mapOfMaps.count.replace("{n}", String(pins.length)).replace("{maps}", plural(locale, pins.length, t.mapOfMaps.maps))}
        </p>
        <MapOfMaps pins={pins} focus={focus} openLabel={t.mapOfMaps.open} />
        <p className="text-xs text-muted">{t.mapOfMaps.authorHint}</p>
      </main>
      <SiteFooter />
    </>
  );
}
