import { env } from "@/lib/env";
import { findDownloadableFile } from "@/server/downloads/access";
import { signDownloadToken } from "@/server/downloads/token";
import { HttpError, assertSameOrigin, jsonError } from "@/server/http";
import { getClientIp, hashIp } from "@/server/security/ip";
import { RATE_LIMITS, consumeRateLimit } from "@/server/security/rate-limit";
import { getUserForHeaders } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readFileId(request: Request): Promise<string | null> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as { fileId?: unknown } | null;
    return typeof body?.fileId === "string" ? body.fileId : null;
  }
  const form = await request.formData().catch(() => null);
  const value = form?.get("fileId");
  return typeof value === "string" ? value : null;
}

/**
 * POST /api/download – vydá 30-minútový podpísaný odkaz na stiahnutie (bez registrácie).
 * Formulár (bez JavaScriptu) dostane 303 presmerovanie priamo na súbor, fetch dostane JSON s URL.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const ip = getClientIp(request.headers);
    const ipHash = hashIp(ip);

    const limit = await consumeRateLimit(RATE_LIMITS.downloadTokenIp, ipHash);
    if (!limit.allowed) {
      throw new HttpError(429, "RATE_LIMITED", { retryAfterSeconds: limit.retryAfterSeconds });
    }

    const fileId = await readFileId(request);
    if (!fileId) throw new HttpError(400, "INVALID_INPUT");
    const viewer = await getUserForHeaders(request.headers);
    const file = await findDownloadableFile(fileId, viewer);
    if (!file) throw new HttpError(404, "FILE_NOT_FOUND");

    const token = signDownloadToken(env().DOWNLOAD_TOKEN_SECRET, file.id, ipHash);
    const url = `/api/download/${token}`;

    const wantsJson = (request.headers.get("accept") ?? "").includes("application/json");
    if (wantsJson) return Response.json({ url, expiresInSeconds: 1800 }, { headers: { "Cache-Control": "no-store" } });
    return new Response(null, { status: 303, headers: { Location: url, "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
