import { assertSameOrigin, jsonError, requireApiUser } from "@/server/http";
import { cancelUpload, getUploadStatus } from "@/server/uploads/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/uploads/[id] – stav uploadu (na naviazanie po výpadku a sledovanie kontroly). */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  try {
    const user = await requireApiUser(request);
    const { id } = await params;
    return Response.json(await getUploadStatus(user, id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}

/** DELETE /api/uploads/[id] – zrušenie a okamžité zmazanie dočasných dát. */
export async function DELETE(request: Request, { params }: Params): Promise<Response> {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser(request);
    const { id } = await params;
    await cancelUpload(user, id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return jsonError(error);
  }
}
