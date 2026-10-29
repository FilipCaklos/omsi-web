import { CalendarClock, Info } from "lucide-react";
import type { AppLocale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/sk";
import { formatDateTime } from "@/lib/format";
import type { ModDetail } from "@/server/mods/detail";
import { Countdown } from "@/components/catalog/countdown";

/** Panel pripravovaného vydania: dátum/odpočet, stav vývoja po častiach. */
export function PlannedPanel({ mod, t, locale, now }: { mod: ModDetail; t: Dictionary; locale: AppLocale; now: number }) {
  const plan = mod.plannedRelease;
  if (!plan) return null;
  const overall = plan.progress.length > 0 ? Math.round(plan.progress.reduce((s, p) => s + p.percent, 0) / plan.progress.length) : null;
  const windowLabel =
    plan.windowYear && plan.windowPart
      ? plan.windowPart === "YEAR"
        ? String(plan.windowYear)
        : `${t.release.windowPart[plan.windowPart as keyof Dictionary["release"]["windowPart"]]} ${plan.windowYear}`
      : null;

  return (
    <div className="space-y-4 rounded-[5px] border border-amber/50 bg-surface p-4">
      <div className="flex items-start gap-3">
        <CalendarClock size={22} strokeWidth={1.75} className="mt-0.5 shrink-0 text-amber" aria-hidden />
        <div className="min-w-0">
          {plan.mode === "EXACT_DATE" && plan.releaseAt ? (
            <>
              <p className="text-xs uppercase tracking-wide text-muted">{t.planned.releaseIn}</p>
              <p className="text-2xl font-bold text-amber">
                <Countdown
                  target={plan.releaseAt.toISOString()}
                  serverNow={now}
                  locale={locale}
                  zeroLabel={mod.status === "SCHEDULED" ? t.planned.releasedNow : t.planned.overdue}
                  refreshOnZero={mod.status === "SCHEDULED"}
                />
              </p>
              <p className="font-mono text-xs text-muted">{formatDateTime(locale, plan.releaseAt)}</p>
            </>
          ) : plan.mode === "WINDOW" && windowLabel ? (
            <>
              <p className="text-xs uppercase tracking-wide text-muted">{t.release.window}</p>
              <p className="text-2xl font-bold">{windowLabel}</p>
            </>
          ) : (
            <p className="text-xl font-bold">{t.release.tba}</p>
          )}
        </div>
      </div>

      {mod.status === "SCHEDULED" && (
        <p className="rounded-[3px] bg-signal-soft px-2.5 py-1.5 text-xs text-text">{t.planned.scheduledNote}</p>
      )}
      {plan.noEtaQuestions && plan.mode !== "EXACT_DATE" && (
        <p className="flex items-start gap-1.5 text-xs text-muted">
          <Info size={13} className="mt-0.5 shrink-0" aria-hidden /> {t.planned.tbaNote}
        </p>
      )}

      {plan.progress.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">{t.release.progress}</p>
          <ul className="space-y-2">
            {plan.progress.map((part) => (
              <li key={part.label}>
                <div className="mb-0.5 flex justify-between text-xs">
                  <span>{part.label}</span>
                  <span className="font-mono">{part.percent} %</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-raised" role="progressbar" aria-label={part.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={part.percent}>
                  <div className={`h-full ${part.percent >= 100 ? "bg-signal" : "bg-amber"}`} style={{ width: `${part.percent}%` }} />
                </div>
              </li>
            ))}
          </ul>
          {overall !== null && (
            <p className="flex justify-between border-t border-line pt-1.5 text-xs font-semibold">
              <span>{t.planned.overall}</span>
              <span className="font-mono">{overall} %</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
