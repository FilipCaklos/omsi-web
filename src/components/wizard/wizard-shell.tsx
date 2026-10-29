import Link from "next/link";
import { CalendarClock, Check } from "lucide-react";
import type { Dictionary } from "@/i18n/dictionaries/sk";
import type { WizardStep } from "@/server/mods/wizard";

const STEP_KEYS: Record<WizardStep, keyof Dictionary["wizard"]["steps"]> = {
  zaklad: "basics",
  popis: "details",
  subory: "files",
  screenshoty: "screenshots",
  doplnky: "extras",
  odoslanie: "review",
};

/** Krokovník Upload Wizardu – každý krok je samostatná URL, koncept je vždy uložený na serveri. */
export function WizardShell({
  t,
  modId,
  current,
  title,
  done,
  children,
}: {
  t: Dictionary;
  modId: string | null;
  current: WizardStep;
  title: string;
  done: Partial<Record<WizardStep, boolean>>;
  children: React.ReactNode;
}) {
  const steps = Object.keys(STEP_KEYS) as WizardStep[];
  return (
    <main id="obsah" className="mx-auto max-w-[1000px] space-y-5 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="mt-1 text-xs text-muted">{t.wizard.draftNote}</p>
        </div>
        {modId && (
          <Link href={`/nahrat/${modId}/vydanie`} className="inline-flex h-9 items-center gap-1.5 rounded-[5px] border border-line px-3 text-sm hover:bg-raised">
            <CalendarClock size={15} aria-hidden /> {t.studioPlan.link}
          </Link>
        )}
      </div>
      <nav aria-label={t.wizard.title}>
        <ol className="scrollbar-thin flex gap-1 overflow-x-auto rounded-[5px] border border-line bg-surface p-1">
          {steps.map((step, index) => {
            const active = step === current;
            const label = (
              <>
                <span className={`grid size-5 shrink-0 place-items-center rounded-full font-mono text-[11px] ${active ? "bg-amber-ink text-amber" : done[step] ? "bg-signal text-white" : "bg-raised text-muted"}`}>
                  {done[step] && !active ? <Check size={12} strokeWidth={3} aria-hidden /> : index + 1}
                </span>
                {t.wizard.steps[STEP_KEYS[step]]}
              </>
            );
            const className = `flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-[3px] px-3 text-sm ${active ? "bg-amber font-semibold text-amber-ink" : "text-muted hover:bg-raised hover:text-text"}`;
            return (
              <li key={step}>
                {modId ? (
                  <Link href={`/nahrat/${modId}?krok=${step}`} aria-current={active ? "step" : undefined} className={className}>
                    {label}
                  </Link>
                ) : (
                  <span aria-current={active ? "step" : undefined} className={`${className} ${active ? "" : "pointer-events-none opacity-50"}`}>
                    {label}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      <div className="rounded-[5px] border border-line bg-surface p-5">{children}</div>
    </main>
  );
}
