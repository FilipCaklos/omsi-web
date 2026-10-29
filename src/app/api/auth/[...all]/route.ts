import { toNextJsHandler } from "better-auth/next-js";
import { NextResponse } from "next/server";
import { getAuth } from "@/server/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Verejne vystavujeme iba endpointy, ktoré musí otvoriť prehliadač (odkazy z emailov, OAuth callback).
 * Registrácia, prihlásenie, obnova hesla a správa účtu idú výhradne cez Server Actions,
 * kde prebieha zod validácia, Turnstile, Redis rate limit a audit log – nedajú sa obísť priamym POST-om.
 */
const ALLOWED_GET = [
  /^\/verify-email$/,
  /^\/reset-password\/[A-Za-z0-9_-]+$/,
  /^\/callback\/[a-z0-9-]+$/,
  /^\/ok$/,
];
const ALLOWED_POST = [/^\/callback\/[a-z0-9-]+$/];

function authPath(request: Request): string {
  return new URL(request.url).pathname.replace(/^\/api\/auth/, "") || "/";
}

function notFound(): NextResponse {
  return NextResponse.json({ error: "NOT_FOUND" }, { status: 404, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request): Promise<Response> {
  if (!ALLOWED_GET.some((pattern) => pattern.test(authPath(request)))) return notFound();
  return toNextJsHandler(getAuth()).GET(request);
}

export async function POST(request: Request): Promise<Response> {
  if (!ALLOWED_POST.some((pattern) => pattern.test(authPath(request)))) return notFound();
  return toNextJsHandler(getAuth()).POST(request);
}
