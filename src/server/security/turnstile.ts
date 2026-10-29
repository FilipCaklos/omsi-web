import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { env } from "@/lib/env";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const TURNSTILE_FIELD = "cf-turnstile-response";

const responseSchema = z.object({
  success: z.boolean(),
  "error-codes": z.array(z.string()).default([]),
  hostname: z.string().optional(),
  action: z.string().optional(),
});

export type TurnstileResult = { ok: true } | { ok: false; reason: "missing" | "invalid" | "unavailable" };

/**
 * Overenie Cloudflare Turnstile tokenu na serveri. Token je jednorazový;
 * idempotency_key umožní bezpečné zopakovanie pri sieťovej chybe.
 */
export async function verifyTurnstile(
  token: FormDataEntryValue | null | undefined,
  remoteIp: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TurnstileResult> {
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) {
    return { ok: false, reason: "missing" };
  }

  const body = new URLSearchParams({
    secret: env().TURNSTILE_SECRET_KEY,
    response: token,
    idempotency_key: randomUUID(),
  });
  if (remoteIp !== "0.0.0.0") body.set("remoteip", remoteIp);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetchImpl(VERIFY_URL, {
        method: "POST",
        body,
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) continue;
      const parsed = responseSchema.safeParse(await response.json());
      if (!parsed.success) continue;
      return parsed.data.success ? { ok: true } : { ok: false, reason: "invalid" };
    } catch (error) {
      console.error("[turnstile]", error instanceof Error ? error.message : error);
    }
  }
  return { ok: false, reason: "unavailable" };
}

export function turnstileSiteKey(): string {
  return env().TURNSTILE_SITE_KEY;
}
