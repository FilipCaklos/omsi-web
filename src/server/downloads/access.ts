import "server-only";
import { db } from "@/lib/db";
import { can, type AppRole } from "@/lib/rbac";

export type DownloadableFile = {
  id: string;
  modId: string;
  originalFilename: string;
  sizeBytes: number;
  sha256: string;
  storageDriver: "LOCAL_DISK" | "S3_COMPATIBLE";
  storageKey: string;
  updatedAt: Date;
};

export type DownloadViewer = { id: string; role: Exclude<AppRole, "GUEST"> } | null;

/**
 * Môže návštevník stiahnuť súbor? Verejne iba:
 *  - súbor prešiel kontrolou (CLEAN – vrátane manuálne schválených),
 *  - verzia je zverejnená a mod je zverejnený, alebo je naplánovaný a čas vydania už nastal.
 * Autor a moderátor môžu stiahnuť aj neschválený súbor (kontrola pred zverejnením).
 */
export async function findDownloadableFile(fileId: string, viewer: DownloadViewer, now = new Date()): Promise<DownloadableFile | null> {
  if (!/^[a-z0-9]{10,40}$/.test(fileId)) return null;
  const file = await db().modFile.findUnique({
    where: { id: fileId },
    select: {
      id: true,
      modId: true,
      originalFilename: true,
      sizeBytes: true,
      sha256: true,
      storageDriver: true,
      storageKey: true,
      scanStatus: true,
      updatedAt: true,
      version: { select: { status: true, scheduledAt: true } },
      mod: {
        select: {
          status: true,
          authorId: true,
          plannedRelease: { select: { releaseAt: true, autoPublish: true } },
        },
      },
    },
  });
  if (!file) return null;

  const privileged = viewer !== null && (viewer.id === file.mod.authorId || can(viewer.role, "moderation:queue"));
  const releasedBySchedule =
    file.mod.status === "SCHEDULED" &&
    file.mod.plannedRelease?.autoPublish === true &&
    file.mod.plannedRelease.releaseAt !== null &&
    file.mod.plannedRelease.releaseAt.getTime() <= now.getTime();
  const versionLive =
    file.version.status === "PUBLISHED" ||
    (file.version.status === "SCHEDULED" && file.version.scheduledAt !== null && file.version.scheduledAt.getTime() <= now.getTime());
  const publicOk = file.scanStatus === "CLEAN" && versionLive && (file.mod.status === "PUBLISHED" || releasedBySchedule);

  if (!publicOk && !(privileged && file.scanStatus !== "REJECTED")) return null;

  return {
    id: file.id,
    modId: file.modId,
    originalFilename: file.originalFilename,
    sizeBytes: Number(file.sizeBytes),
    sha256: file.sha256,
    storageDriver: file.storageDriver,
    storageKey: file.storageKey,
    updatedAt: file.updatedAt,
  };
}
