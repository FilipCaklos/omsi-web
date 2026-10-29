import { assertSameOrigin, jsonError, requireApiUser } from "@/server/http";
import { initUpload } from "@/server/uploads/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/uploads – založí chunked upload súboru modu. */
export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser(request);
    const body: unknown = await request.json().catch(() => null);
    const upload = await initUpload(user, body, request.headers);
    return Response.json(upload, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
