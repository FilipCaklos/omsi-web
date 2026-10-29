import { exportUserData } from "@/server/account/data";
import { jsonError, requireApiUser } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/ucet/export – kópia všetkých osobných údajov prihláseného používateľa ako JSON súbor. */
export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser(request);
    const data = await exportUserData(user.id);
    const date = new Date().toISOString().slice(0, 10);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="omsi-depo-${user.username}-${date}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
