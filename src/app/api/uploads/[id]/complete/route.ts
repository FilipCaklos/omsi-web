import { assertSameOrigin, jsonError, requireApiUser, runAfterResponse } from "@/server/http";
import { completeUpload, processUpload } from "@/server/uploads/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/uploads/[id]/complete – po poslednom chunku. Odpoveď 202 príde hneď,
 * SHA-256 a kontrola archívu bežia na pozadí; klient sleduje GET /api/uploads/[id].
 */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser(request);
    const { id } = await params;
    const status = await completeUpload(user, id);
    if (status.status === "SCANNING") runAfterResponse(() => processUpload(id));
    return Response.json(status, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
