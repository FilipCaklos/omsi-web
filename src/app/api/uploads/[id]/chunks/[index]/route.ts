import { HttpError, assertSameOrigin, jsonError, requireApiUser } from "@/server/http";
import { writeChunk } from "@/server/uploads/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; index: string }> };

/** PUT /api/uploads/[id]/chunks/[index] – telo požiadavky sú surové bajty chunku (application/octet-stream). */
export async function PUT(request: Request, { params }: Params): Promise<Response> {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser(request);
    const { id, index } = await params;
    if (!/^\d{1,6}$/.test(index)) throw new HttpError(400, "INVALID_CHUNK_INDEX");
    const lengthHeader = request.headers.get("content-length");
    const declared = lengthHeader !== null && /^\d+$/.test(lengthHeader) ? Number(lengthHeader) : null;
    const status = await writeChunk(user, id, Number(index), request.body, declared);
    return Response.json(status, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
