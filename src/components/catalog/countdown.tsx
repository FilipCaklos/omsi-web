"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const UNITS = {
  sk: { d: "d", h: "h", m: "min", s: "s" },
  cs: { d: "d", h: "h", m: "min", s: "s" },
} as const;

function split(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    d: Math.floor(total / 86_400),
    h: Math.floor((total % 86_400) / 3_600),
    m: Math.floor((total % 3_600) / 60),
    s: total % 60,
  };
}

/**
 * Živý odpočet do presného času vydania. Server dodá počiatočný čas (bez hydration mismatch).
 * S `refreshOnZero` po dosiahnutí nuly obnoví stránku – server medzitým vydanie odomkne.
 */
export function Countdown({
  target,
  serverNow,
  locale,
  zeroLabel,
  refreshOnZero = false,
}: {
  target: string;
  serverNow: number;
  locale: "sk" | "cs";
  zeroLabel: string;
  refreshOnZero?: boolean;
}) {
  const router = useRouter();
  const targetMs = new Date(target).getTime();
  const [now, setNow] = useState(serverNow);
  const refreshed = useRef(false);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const remaining = targetMs - now;
  useEffect(() => {
    if (!refreshOnZero || remaining > 0 || refreshed.current) return;
    refreshed.current = true;
    // Krátka rezerva na rozdiel hodín klienta a servera
    const timer = window.setTimeout(() => router.refresh(), 2_500);
    return () => window.clearTimeout(timer);
  }, [refreshOnZero, remaining, router]);

  const u = UNITS[locale];
  if (remaining <= 0) return <span className="font-mono text-signal">{zeroLabel}</span>;
  const { d, h, m, s } = split(remaining);
  const pad = (n: number) => n.toString().padStart(2, "0");

  return (
    <time dateTime={target} className="font-mono tabular-nums" suppressHydrationWarning>
      {d > 0 && `${d} ${u.d} `}
      {pad(h)}
      {u.h} {pad(m)}
      {u.m} {pad(s)}
      {u.s}
    </time>
  );
}
