import type { AppLocale } from "@/i18n/config";
import { formatDate, formatNumber } from "@/lib/format";

/** Stĺpcový graf stiahnutí po dňoch – čisté SVG zo servera, bez knižnice a JavaScriptu. */
export function DownloadsChart({ points, locale, label }: { points: { day: string; count: number }[]; locale: AppLocale; label: string }) {
  const width = 720;
  const height = 180;
  const pad = { top: 12, bottom: 22, left: 4, right: 4 };
  const max = Math.max(1, ...points.map((p) => p.count));
  const slot = (width - pad.left - pad.right) / Math.max(1, points.length);
  const barWidth = Math.max(2, slot - 3);
  const plotHeight = height - pad.top - pad.bottom;
  const first = points[0];
  const last = points.at(-1);

  return (
    <figure className="space-y-1">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="h-auto w-full text-amber">
        <line x1={pad.left} x2={width - pad.right} y1={height - pad.bottom} y2={height - pad.bottom} className="stroke-line" strokeWidth={1} />
        {points.map((point, index) => {
          const barHeight = (point.count / max) * plotHeight;
          return (
            <rect
              key={point.day}
              x={pad.left + index * slot + (slot - barWidth) / 2}
              y={height - pad.bottom - barHeight}
              width={barWidth}
              height={Math.max(point.count > 0 ? 2 : 0, barHeight)}
              rx={2}
              fill="currentColor"
            >
              <title>{`${formatDate(locale, new Date(point.day))}: ${formatNumber(locale, point.count)}`}</title>
            </rect>
          );
        })}
        <text x={pad.left} y={height - 6} className="fill-muted font-mono" fontSize={11}>
          {first ? formatDate(locale, new Date(first.day)) : ""}
        </text>
        <text x={width - pad.right} y={height - 6} textAnchor="end" className="fill-muted font-mono" fontSize={11}>
          {last ? formatDate(locale, new Date(last.day)) : ""}
        </text>
        <text x={width - pad.right} y={pad.top} textAnchor="end" className="fill-muted font-mono" fontSize={11}>
          max {formatNumber(locale, max)}
        </text>
      </svg>
      <figcaption className="text-xs text-muted">{label}</figcaption>
    </figure>
  );
}
