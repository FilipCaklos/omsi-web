import Link from "next/link";
import { Download, ImageOff, Star, TriangleAlert } from "lucide-react";
import type { AppLocale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/sk";
import { formatBytes, formatExtension, formatNumber } from "@/lib/format";
import { worksInOpenOmsi } from "@/lib/open-omsi";
import type { ModCardData } from "@/server/catalog";

export function ModThumb({ imageId, alt, label }: { imageId: string | null; alt: string; label: string }) {
  if (!imageId) {
    return (
      <div className="no-screenshot flex aspect-video w-full items-center justify-center text-muted">
        <span className="flex items-center gap-1.5 bg-raised px-2 py-0.5 text-xs">
          <ImageOff size={14} strokeWidth={1.75} aria-hidden />
          {label}
        </span>
      </div>
    );
  }
  return (
    // Náhľady sú už na serveri prekonvertované na 16:9 WebP (sharp), preto bez next/image optimalizácie
    <img
      src={`/api/media/${imageId}?variant=thumb`}
      alt={alt}
      width={640}
      height={360}
      loading="lazy"
      decoding="async"
      className="aspect-video w-full object-cover"
    />
  );
}

export function FileMeta({ mod, locale }: { mod: ModCardData; locale: AppLocale }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[11.5px] text-muted">
      {mod.version && <span className="text-text">v{mod.version.replace(/^v/i, "")}</span>}
      {mod.mainFileBytes !== null && <span>{formatBytes(locale, mod.mainFileBytes)}</span>}
      {mod.mainFileExt && <span>{formatExtension(mod.mainFileExt)}</span>}
      <span className="inline-flex items-center gap-1">
        <Download size={11} strokeWidth={2} aria-hidden />
        {formatNumber(locale, mod.downloadCount)}
      </span>
    </span>
  );
}

/** Odznaky modu (openOMSI, 4GB Patch) – rovnaké na karte aj v odporúčaných. */
export function ModBadges({ mod, t }: { mod: Pick<ModCardData, "openOmsi" | "requires4GbPatch">; t: Dictionary }) {
  if (!worksInOpenOmsi(mod.openOmsi) && !mod.requires4GbPatch) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {worksInOpenOmsi(mod.openOmsi) && (
        <p className="rounded-[3px] bg-signal-soft px-1.5 py-0.5 text-[11px] font-medium text-signal">
          {mod.openOmsi === "EXCLUSIVE" ? t.openOmsi.badgeExclusive : `${t.openOmsi.badge} ✓`}
        </p>
      )}
      {mod.requires4GbPatch && (
        <p className="inline-flex items-center gap-1 rounded-[3px] bg-alert-soft px-1.5 py-0.5 text-[11px] font-medium text-alert">
          <TriangleAlert size={12} strokeWidth={2} aria-hidden />
          {t.mod.requires4gb}
        </p>
      )}
    </div>
  );
}

export function ModCard({ mod, locale, t }: { mod: ModCardData; locale: AppLocale; t: Dictionary }) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-[5px] border border-line bg-surface transition-colors hover:border-line-strong">
      <Link href={`/mod/${mod.slug}`} className="relative block" tabIndex={-1} aria-hidden>
        <ModThumb imageId={mod.imageId} alt="" label={t.mod.noScreenshot} />
        <span className="led-tag absolute left-2 top-2">{mod.categoryName}</span>
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div>
          <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug">
            <Link href={`/mod/${mod.slug}`} className="hover:text-amber">
              {mod.title}
            </Link>
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            {t.mod.by} <span className="text-text">{mod.authorName}</span>
            {mod.ratingCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-0.5 font-mono">
                <Star size={11} strokeWidth={2} className="fill-amber text-amber" aria-hidden />
                {mod.ratingAvg.toFixed(1)}
              </span>
            )}
          </p>
        </div>
        <p className="line-clamp-2 text-sm text-muted">{mod.summary}</p>
        <ModBadges mod={mod} t={t} />
        <div className="mt-auto flex items-end justify-between gap-2 border-t border-line pt-2">
          <FileMeta mod={mod} locale={locale} />
          <Link
            href={`/mod/${mod.slug}#subory`}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[5px] bg-amber px-2.5 text-xs font-semibold text-amber-ink hover:bg-amber-hover"
          >
            <Download size={14} strokeWidth={2.25} aria-hidden />
            {t.mod.download}
          </Link>
        </div>
      </div>
    </article>
  );
}
