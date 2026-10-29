"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLocaleAction } from "@/app/actions/preferences";
import { LOCALES, type AppLocale } from "@/i18n/config";

export function LocaleSwitch({ current, label }: { current: AppLocale; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(locale: AppLocale) {
    if (locale === current || pending) return;
    startTransition(async () => {
      await setLocaleAction(locale);
      document.documentElement.lang = locale;
      router.refresh();
    });
  }

  return (
    <div
      role="group"
      aria-label={label}
      className="flex h-9 items-stretch overflow-hidden rounded-[5px] border border-line font-mono text-xs font-semibold"
    >
      {LOCALES.map((locale, index) => {
        const active = locale === current;
        return (
          <button
            key={locale}
            type="button"
            onClick={() => choose(locale)}
            aria-pressed={active}
            disabled={pending}
            className={[
              "px-2.5 uppercase transition-colors disabled:cursor-wait",
              index > 0 ? "border-l border-line" : "",
              active ? "bg-amber text-amber-ink" : "text-muted hover:bg-raised hover:text-text",
            ].join(" ")}
          >
            {locale === "cs" ? "CZ" : "SK"}
          </button>
        );
      })}
    </div>
  );
}
