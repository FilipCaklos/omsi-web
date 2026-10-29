import "server-only";
import { db } from "@/lib/db";
import { redis } from "@/lib/redis";

const DAY_SECONDS = 24 * 60 * 60;

/**
 * Deduplikované počítadlo: 1 stiahnutie na používateľa (alebo hash IP) za 24 hodín.
 *  - súbor: ModFile.downloadCount (hlavný súbor a patch sa počítajú zvlášť),
 *  - mod: Mod.downloadCount + DownloadEvent (rebríček „7 dní“) – stiahnutie hlavného súboru aj patchu
 *    toho istého modu je pre mod jedno stiahnutie.
 * F5 ani naväzovanie prerušeného sťahovania (Range) štatistiku nezvyšuje.
 */
export async function recordDownload(params: { fileId: string; modId: string; userId: string | null; ipHash: string }): Promise<void> {
  const identity = params.userId ? `u:${params.userId}` : `ip:${params.ipHash}`;

  let fileIsNew: boolean;
  let modIsNew: boolean;
  try {
    const [fileResult, modResult] = await Promise.all([
      redis().set(`dl:f:${params.fileId}:${identity}`, "1", "EX", DAY_SECONDS, "NX"),
      redis().set(`dl:m:${params.modId}:${identity}`, "1", "EX", DAY_SECONDS, "NX"),
    ]);
    fileIsNew = fileResult === "OK";
    modIsNew = modResult === "OK";
  } catch {
    // Záložná deduplikácia z DB pri výpadku Redisu (iba na úrovni modu)
    const since = new Date(Date.now() - DAY_SECONDS * 1000);
    const existing = await db().downloadEvent.findFirst({
      where: {
        modId: params.modId,
        createdAt: { gte: since },
        ...(params.userId ? { userId: params.userId } : { ipHash: params.ipHash }),
      },
      select: { id: true },
    });
    fileIsNew = false;
    modIsNew = existing === null;
  }

  if (!fileIsNew && !modIsNew) return;
  await db().$transaction([
    ...(fileIsNew ? [db().modFile.update({ where: { id: params.fileId }, data: { downloadCount: { increment: 1 } } })] : []),
    ...(modIsNew
      ? [
          db().mod.update({ where: { id: params.modId }, data: { downloadCount: { increment: 1 } } }),
          db().downloadEvent.create({
            data: { fileId: params.fileId, modId: params.modId, userId: params.userId, ipHash: params.ipHash },
          }),
        ]
      : []),
  ]);
}
