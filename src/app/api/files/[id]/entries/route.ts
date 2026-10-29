import { db } from "@/lib/db";
import { findDownloadableFile } from "@/server/downloads/access";
import { getUserForHeaders } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/files/[id]/entries – strom súborov archívu pre „Zobraziť obsah archívu“ (pred stiahnutím). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const viewer = await getUserForHeaders(request.headers);
  const file = await findDownloadableFile(id, viewer);
  if (!file) return Response.json({ error: "FILE_NOT_FOUND" }, { status: 404 });

  const row = await db().modFile.findUnique({
    where: { id },
    select: { archiveEntries: true, archiveEntryCount: true, scanNotes: true },
  });
  const notes = (row?.scanNotes ?? {}) as { installPrefix?: string | null; entriesTruncated?: boolean };
  return Response.json(
    {
      entries: Array.isArray(row?.archiveEntries) ? row.archiveEntries : [],
      entryCount: row?.archiveEntryCount ?? 0,
      installPrefix: notes.installPrefix ?? null,
      truncated: notes.entriesTruncated === true,
    },
    { headers: { "Cache-Control": viewer ? "private, max-age=60" : "public, max-age=300" } },
  );
}
