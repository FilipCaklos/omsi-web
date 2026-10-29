import "server-only";
import { headers } from "next/headers";
import type { AuthErrorCode, FormState } from "@/lib/form-state";
import { audit } from "@/server/audit";
import { getClientIp, hashIp } from "@/server/security/ip";
import { consumeAll, type RateLimitPolicy } from "@/server/security/rate-limit";
import { TURNSTILE_FIELD, verifyTurnstile } from "@/server/security/turnstile";

export type RequestContext = { headers: Headers; ip: string; ipHash: string };

export async function requestContext(): Promise<RequestContext> {
  const h = new Headers(await headers());
  const ip = getClientIp(h);
  return { headers: h, ip, ipHash: hashIp(ip) };
}

export function failure(
  attempt: number,
  error: AuthErrorCode,
  extra: Omit<Partial<FormState>, "status" | "attempt" | "error"> = {},
): FormState {
  return { status: "error", error, attempt: attempt + 1, ...extra };
}

export function previousAttempt(state: FormState | undefined): number {
  return state?.attempt ?? 0;
}

/** Rate limit + Turnstile v jednom kroku. Vráti FormState s chybou alebo null, ak je všetko v poriadku. */
export async function guardForm(options: {
  ctx: RequestContext;
  attempt: number;
  limits: ReadonlyArray<readonly [RateLimitPolicy, string]>;
  formData?: FormData;
  requireTurnstile: boolean;
  auditActorId?: string | null;
}): Promise<FormState | null> {
  const limit = await consumeAll(options.limits);
  if (!limit.allowed && limit.unavailable) {
    return failure(options.attempt, "SERVICE_UNAVAILABLE");
  }
  if (!limit.allowed) {
    await audit({
      action: "auth.rate_limited",
      actorId: options.auditActorId ?? null,
      metadata: { policies: options.limits.map(([p]) => p.name) },
      headers: options.ctx.headers,
    });
    return failure(options.attempt, "RATE_LIMITED", {
      errorParams: { minutes: String(Math.max(1, Math.ceil(limit.retryAfterSeconds / 60))) },
    });
  }

  if (options.requireTurnstile) {
    const result = await verifyTurnstile(options.formData?.get(TURNSTILE_FIELD), options.ctx.ip);
    if (!result.ok) {
      await audit({
        action: "auth.turnstile_failed",
        actorId: options.auditActorId ?? null,
        metadata: { reason: result.reason },
        headers: options.ctx.headers,
      });
      return failure(options.attempt, result.reason === "unavailable" ? "TURNSTILE_UNAVAILABLE" : "TURNSTILE_FAILED");
    }
  }
  return null;
}

/**
 * Pri chybe pridá do stavu odoslané (necitlivé) hodnoty. React po odoslaní formulár resetuje
 * na defaultValue – formulár ich z state.values znova vyplní a používateľ nestratí, čo napísal.
 */
export function keepValues(state: FormState, formData: FormData, names: readonly string[]): FormState {
  if (state.status !== "error") return state;
  const values: Record<string, string> = { ...state.values };
  for (const name of names) {
    values[name] = formData
      .getAll(name)
      .filter((v): v is string => typeof v === "string")
      .join(",");
  }
  return { ...state, values };
}

/** Hodnota z FormData ako reťazec (alebo undefined) – pre zod parse. */
export function field(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
}
