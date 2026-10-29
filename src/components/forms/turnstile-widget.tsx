"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/**
 * Cloudflare Turnstile v explicitnom režime. Skript sa načíta s CSP nonce;
 * widget vloží skryté pole „cf-turnstile-response“, ktoré overí server.
 * Pri zmene `resetKey` (nový pokus o odoslanie) sa token obnoví – je jednorazový.
 */
export function TurnstileWidget({
  siteKey,
  nonce,
  resetKey,
  locale,
}: {
  siteKey: string;
  nonce: string | undefined;
  resetKey: number;
  locale: "sk" | "cs";
}) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (window.turnstile) setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !container.current || !window.turnstile || widgetId.current) return;
    const theme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    widgetId.current = window.turnstile.render(container.current, {
      sitekey: siteKey,
      theme,
      language: locale === "cs" ? "cs" : "sk",
      appearance: "interaction-only",
      "refresh-expired": "auto",
    });
    return () => {
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [ready, siteKey, locale]);

  useEffect(() => {
    if (resetKey > 0 && widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
  }, [resetKey]);

  return (
    <>
      <Script src={SCRIPT_SRC} nonce={nonce} strategy="afterInteractive" onReady={() => setReady(true)} />
      <div ref={container} className="min-h-0 empty:hidden" />
    </>
  );
}
