import Link from "next/link";
import { CalendarClock, Users } from "lucide-react";
import type { AppLocale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/sk";
import { formatDateTime, formatNumber } from "@/lib/format";
import type { UpcomingEntry } from "@/server/catalog";
import { Countdown } from "./countdown";

function ReleaseLabel({ entry, locale, t, now }: { entry: UpcomingEntry; locale: AppLocale; t: Dictionary; now: number }) {
  if (entry.mode === "EXACT_DATE" && entry.releaseAt) {
    return (
      <span className="flex flex-col gap-0.5">
        <span className="text-amber">
          <Countdown target={entry.releaseAt.toISOString()} serverNow={now} locale={locale} zeroLabel={entry.status === "SCHEDULED" ? t.planned.releasedNow : t.planned.overdue} />
        </span>
        <span className="font-mono text-[11px] text-muted">{formatDateTime(locale, entry.releaseAt)}</span>
      </span>
    );
  }
  if (entry.mode === "WINDOW" && entry.windowYear && entry.windowPart) {
    const part = t.release.windowPart[entry.windowPart as keyof Dictionary["release"]["windowPart"]];
    return (
      <span className="font-mono text-text">
        {t.release.window}: {entry.windowPart === "YEAR" ? entry.windowYear : `${part} ${entry.windowYear}`}
      </span>
    );
  }
  return <span className="font-mono text-muted">{t.release.tba}</span>;
}

export function UpcomingCard({
  entry,
  locale,
  t,
  now,
}: {
  entry: UpcomingEntry;
  locale: AppLocale;
  t: Dictionary;
  now: number;
}) {
  return (
    <article className="flex flex-col gap-2 rounded-[5px] border border-line bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold leading-snug">
          <Link href={`/mod/${entry.slug}`} className="hover:text-amber">
            {entry.title}
          </Link>
        </h3>
        <span className="led-tag shrink-0">{entry.categoryName}</span>
      </div>
      <p className="text-xs text-muted">
        {t.mod.by} <span className="text-text">{entry.authorName}</span>
      </p>
      <div className="flex items-center gap-2 text-sm">
        <CalendarClock size={15} strokeWidth={1.75} className="shrink-0 text-muted" aria-hidden />
        <ReleaseLabel entry={entry} locale={locale} t={t} now={now} />
      </div>
      {entry.overallPercent !== null && (
        <div>
          <div className="mb-1 flex justify-between font-mono text-[11px] text-muted">
            <span>{t.release.progress}</span>
            <span className="text-text">{entry.overallPercent} %</span>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-raised"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={entry.overallPercent}
          >
            <div className="h-full bg-amber" style={{ width: `${entry.overallPercent}%` }} />
          </div>
        </div>
      )}
      <p className="mt-auto flex items-center gap-1 font-mono text-[11px] text-muted">
        <Users size={12} strokeWidth={2} aria-hidden />
        {formatNumber(locale, entry.followerCount)}
      </p>
    </article>
  );
}
