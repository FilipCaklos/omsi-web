import type { ArchiveFormat, FileKind, ScanStatus } from "@/generated/prisma/client";

/** Súbor tak, ako ho potrebuje panel „Súbory na stiahnutie“. */
export type CenterFile = {
  id: string;
  kind: FileKind;
  displayName: string;
  description: string;
  filename: string;
  extension: string;
  sizeBytes: number;
  sha256: string;
  scanStatus: ScanStatus;
  archiveFormat: ArchiveFormat;
  archiveEntryCount: number;
  archiveUncompressedBytes: number | null;
  omsiFolders: string[];
  installPrefix: string | null;
  entriesTruncated: boolean;
  mirrorUrl: string | null;
  mirrorLabel: string | null;
  downloadCount: number;
  versionId: string;
  version: string;
  versionPublishedAt: Date;
  sortOrder: number;
};

export type CenterVersion = { id: string; version: string; publishedAt: Date; files: CenterFile[] };

export type DownloadCenter = {
  main: CenterFile | null;
  patches: CenterFile[];
  optional: CenterFile[];
  oldVersions: { version: string; publishedAt: Date; files: CenterFile[] }[];
};

/**
 * Rozdelenie súborov zverejnených verzií:
 *  - hlavný súbor = MAIN z najnovšej verzie, ktorá ho má,
 *  - patche a voliteľné súbory = z tejto verzie a novších (najnovšie navrchu),
 *  - archív = OLD_VERSION/MAIN zo starších verzií, zoskupené podľa verzie.
 */
export function buildDownloadCenter(publishedVersions: CenterVersion[]): DownloadCenter {
  const versions = [...publishedVersions].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  const mainVersion = versions.find((v) => v.files.some((f) => f.kind === "MAIN"));
  const main = mainVersion?.files.filter((f) => f.kind === "MAIN").sort((a, b) => a.sortOrder - b.sortOrder)[0] ?? null;
  const since = mainVersion?.publishedAt.getTime() ?? 0;

  const current = versions.filter((v) => v.publishedAt.getTime() >= since);
  const byOrder = (a: CenterFile, b: CenterFile) =>
    b.versionPublishedAt.getTime() - a.versionPublishedAt.getTime() || a.sortOrder - b.sortOrder;
  const patches = current.flatMap((v) => v.files.filter((f) => f.kind === "PATCH")).sort(byOrder);
  const optional = current.flatMap((v) => v.files.filter((f) => f.kind === "OPTIONAL")).sort(byOrder);

  // Staršie verzie celé (aj ich vlastné patche a doplnky) – pre spätnú kompatibilitu s inými modmi
  const oldVersions = versions
    .filter((v) => v.publishedAt.getTime() < since)
    .map((v) => ({ version: v.version, publishedAt: v.publishedAt, files: [...v.files].sort((a, b) => a.sortOrder - b.sortOrder) }))
    .filter((v) => v.files.length > 0);

  return { main, patches, optional, oldVersions };
}
