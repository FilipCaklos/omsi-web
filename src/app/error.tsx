"use client";

import { useEffect } from "react";

const TEXT = {
  sk: { title: "Niečo sa pokazilo", body: "Požiadavku sa nepodarilo spracovať. Skús to prosím znova.", retry: "Skúsiť znova" },
  cs: { title: "Něco se pokazilo", body: "Požadavek se nepodařilo zpracovat. Zkus to prosím znovu.", retry: "Zkusit znovu" },
} as const;

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const locale = typeof document !== "undefined" && document.documentElement.lang === "cs" ? "cs" : "sk";
  const t = TEXT[locale];

  return (
    <main className="mx-auto flex max-w-xl flex-col items-start gap-3 px-4 py-20">
      <span className="led-tag text-sm">ERR</span>
      <h1 className="text-2xl font-bold">{t.title}</h1>
      <p className="text-muted">{t.body}</p>
      {error.digest && <p className="font-mono text-xs text-muted">ID: {error.digest}</p>}
      <button
        type="button"
        onClick={reset}
        className="mt-2 inline-flex h-9 items-center rounded-[5px] bg-amber px-3.5 text-sm font-semibold text-amber-ink hover:bg-amber-hover"
      >
        {t.retry}
      </button>
    </main>
  );
}
