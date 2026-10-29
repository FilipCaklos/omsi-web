import "server-only";
import { env } from "@/lib/env";
import type { CurrentUser } from "@/server/session";
import { getUserForHeaders } from "@/server/session";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(code);
    this.name = "HttpError";
  }
}

export function jsonError(error: unknown): Response {
  if (error instanceof HttpError) {
    return Response.json({ error: error.code, ...error.details }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  }
  console.error("[api] neočakávaná chyba:", error);
  return Response.json({ error: "INTERNAL_ERROR" }, { status: 500, headers: { "Cache-Control": "no-store" } });
}

/**
 * Ochrana proti CSRF pre API s cookie autentifikáciou: meniaca požiadavka musí prísť z nášho originu.
 * (Prehliadače posielajú Origin pri POST/PUT/DELETE; Sec-Fetch-Site je doplnková kontrola.)
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") throw new HttpError(403, "CROSS_SITE_REQUEST");
  if (!origin || origin !== new URL(env().APP_URL).origin) throw new HttpError(403, "CROSS_SITE_REQUEST");
}

export async function requireApiUser(request: Request): Promise<CurrentUser> {
  const user = await getUserForHeaders(request.headers);
  if (!user) throw new HttpError(401, "UNAUTHENTICATED");
  return user;
}

/** Spustí prácu po odoslaní odpovede (Next.js `after`); mimo požiadavky (skripty, testy) ihneď na pozadí. */
export function runAfterResponse(task: () => Promise<void>): void {
  const guarded = async () => {
    try {
      await task();
    } catch (error) {
      console.error("[background] úloha zlyhala:", error);
    }
  };
  // Lenivý import: `next/server` sa načíta až pri prvom použití (asynchrónny kontext požiadavky sa zachová)
  import("next/server")
    .then(({ after }) => after(guarded))
    .catch(() => void guarded());
}
