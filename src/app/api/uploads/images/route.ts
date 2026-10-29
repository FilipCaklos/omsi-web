import { env } from "@/lib/env";
import { HttpError, assertSameOrigin, jsonError, requireApiUser } from "@/server/http";
import { storeScreenshot } from "@/server/media/images";
import { RATE_LIMITS, consumeRateLimit } from "@/server/security/rate-limit";
import { getSettings } from "@/server/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/uploads/images – multipart: file, kind (SCREENSHOT|DEVLOG), voliteľne modId. */
export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser(request);
    if (!user.emailVerified) throw new HttpError(403, "EMAIL_NOT_VERIFIED");
    if (!(await getSettings()).uploadsEnabled) throw new HttpError(503, "UPLOADS_DISABLED");

    // Telo odmietneme ešte pred načítaním do pamäte
    const length = Number(request.headers.get("content-length") ?? "NaN");
    if (!Number.isFinite(length) || length > env().UPLOAD_MAX_IMAGE_BYTES + 64 * 1024) {
      throw new HttpError(413, "IMAGE_TOO_LARGE");
    }

    const limit = await consumeRateLimit(RATE_LIMITS.uploadInit, `img:${user.id}`);
    if (!limit.allowed) throw new HttpError(429, "RATE_LIMITED", { retryAfterSeconds: limit.retryAfterSeconds });

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "IMAGE_MISSING");
    const kindRaw = form?.get("kind");
    const kind = kindRaw === "DEVLOG" ? "DEVLOG" : "SCREENSHOT";
    const modIdRaw = form?.get("modId");
    const modId = typeof modIdRaw === "string" && /^[a-z0-9]{10,40}$/.test(modIdRaw) ? modIdRaw : null;

    const image = await storeScreenshot({
      user,
      input: Buffer.from(await file.arrayBuffer()),
      filename: file.name,
      kind,
      modId,
    });
    return Response.json(
      { ...image, thumbUrl: `/api/media/${image.id}?variant=thumb`, fullUrl: `/api/media/${image.id}?variant=full` },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
