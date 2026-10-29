import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { AppLocale } from "@/i18n/config";
import { db } from "@/lib/db";
import { canEditMod, canViewMod, type Viewer } from "./access";
import { buildDownloadCenter, type CenterFile, type CenterVersion, type DownloadCenter } from "./download-center";
import { mainFileIds } from "./helpers";
import { publishDueScheduled } from "./releases";

const fileSelect = {
  id: true,
  kind: true,
  displayName: true,
  description: true,
  originalFilename: true,
  extension: true,
  sizeBytes: true,
  sha256: true,
  scanStatus: true,
  scanNotes: true,
  archiveFormat: true,
  archiveEntryCount: true,
  archiveUncompressedBytes: true,
  omsiFolders: true,
  mirrorUrl: true,
  mirrorLabel: true,
  downloadCount: true,
  sortOrder: true,
} satisfies Prisma.ModFileSelect;

type FileRow = Prisma.ModFileGetPayload<{ select: typeof fileSelect }>;

function toCenterFile(file: FileRow, version: { id: string; version: string; publishedAt: Date }): CenterFile {
  const notes = (file.scanNotes ?? {}) as { installPrefix?: string | null; entriesTruncated?: boolean };
  return {
    id: file.id,
    kind: file.kind,
    displayName: file.displayName,
    description: file.description,
    filename: file.originalFilename,
    extension: file.extension,
    sizeBytes: Number(file.sizeBytes),
    sha256: file.sha256,
    scanStatus: file.scanStatus,
    archiveFormat: file.archiveFormat,
    archiveEntryCount: file.archiveEntryCount,
    archiveUncompressedBytes: file.archiveUncompressedBytes === null ? null : Number(file.archiveUncompressedBytes),
    omsiFolders: file.omsiFolders,
    installPrefix: notes.installPrefix ?? null,
    entriesTruncated: notes.entriesTruncated === true,
    mirrorUrl: file.mirrorUrl,
    mirrorLabel: file.mirrorLabel,
    downloadCount: file.downloadCount,
    versionId: version.id,
    version: version.version,
    versionPublishedAt: version.publishedAt,
    sortOrder: file.sortOrder,
  };
}

/** Typ detailu je odvodený z buildDetail (jediný zdroj pravdy pre tvar dát). */
type ModDetailResult = NonNullable<Awaited<ReturnType<typeof buildDetail>>>;

export type DependencyView =
  | { kind: "STEAM_DLC"; required: boolean; name: string; url: string | null; note: string | null }
  | { kind: "INTERNAL_MOD"; required: boolean; slug: string; title: string; mainFileId: string | null; note: string | null }
  | { kind: "EXTERNAL_LINK"; required: boolean; label: string; url: string; note: string | null };

export async function getModDetail(slug: string, viewer: Viewer, locale: AppLocale, retried = false): Promise<ModDetailResult | null> {
  // Naplánované vydanie, ktorého čas nastal, sa odomkne hneď pri zobrazení (nečaká na plánovač)
  if (!retried) {
    const due = await db().mod.findFirst({
      where: { slug, status: "SCHEDULED", plannedRelease: { autoPublish: true, releaseAt: { lte: new Date() } } },
      select: { id: true },
    });
    if (due) {
      await publishDueScheduled(new Date(), due.id);
      return getModDetail(slug, viewer, locale, true);
    }
  }
  return buildDetail(slug, viewer, locale);
}

async function buildDetail(slug: string, viewer: Viewer, locale: AppLocale) {
  const mod = await db().mod.findUnique({
    where: { slug },
    include: {
      author: { select: { id: true, role: true, username: true, name: true } },
      category: { select: { slug: true, nameSk: true, nameCs: true } },
      subcategory: { select: { slug: true, nameSk: true, nameCs: true } },
      brands: { select: { brand: { select: { slug: true, name: true } } } },
      operators: { select: { operator: { select: { slug: true, name: true } } } },
      credits: { orderBy: { sortOrder: "asc" }, select: { name: true, role: true, user: { select: { username: true } } } },
      dependencies: {
        orderBy: { sortOrder: "asc" },
        include: {
          steamDlc: { select: { name: true, storeUrl: true } },
          targetMod: { select: { id: true, slug: true, title: true, status: true } },
        },
      },
      images: { where: { kind: "SCREENSHOT" }, orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], select: { id: true, width: true, height: true } },
      versions: {
        where: { status: "PUBLISHED", publishedAt: { not: null } },
        orderBy: { publishedAt: "desc" },
        select: { id: true, version: true, changelogHtml: true, publishedAt: true, files: { select: fileSelect } },
      },
      currentVersion: { select: { version: true } },
      plannedRelease: {
        select: {
          mode: true,
          releaseAt: true,
          windowYear: true,
          windowPart: true,
          noEtaQuestions: true,
          autoPublish: true,
          releasedAt: true,
          progress: { orderBy: { sortOrder: "asc" }, select: { label: true, percent: true } },
        },
      },
    },
  });
  if (!mod || !canViewMod(viewer, mod)) return null;

  const publishedVersions: CenterVersion[] = mod.versions.map((v) => {
    const meta = { id: v.id, version: v.version, publishedAt: v.publishedAt as Date };
    return { ...meta, files: v.files.map((f) => toCenterFile(f, meta)) };
  });
  // Pripravované mody (PLANNED) ešte nemajú čo stiahnuť
  const center: DownloadCenter =
    mod.status === "PLANNED" ? { main: null, patches: [], optional: [], oldVersions: [] } : buildDownloadCenter(publishedVersions);

  const internalIds = mod.dependencies.flatMap((d) => (d.targetMod ? [d.targetMod.id] : []));
  const depFiles = await mainFileIds(internalIds);
  const dependencies: DependencyView[] = mod.dependencies.flatMap((d): DependencyView[] => {
    if (d.kind === "STEAM_DLC" && d.steamDlc) {
      return [{ kind: "STEAM_DLC", required: d.required, name: d.steamDlc.name, url: d.steamDlc.storeUrl, note: d.note }];
    }
    if (d.kind === "INTERNAL_MOD" && d.targetMod && d.targetMod.status === "PUBLISHED") {
      return [{
        kind: "INTERNAL_MOD",
        required: d.required,
        slug: d.targetMod.slug,
        title: d.targetMod.title,
        mainFileId: depFiles.get(d.targetMod.id) ?? null,
        note: d.note,
      }];
    }
    if (d.kind === "EXTERNAL_LINK" && d.externalUrl) {
      return [{ kind: "EXTERNAL_LINK", required: d.required, label: d.externalLabel ?? d.externalUrl, url: d.externalUrl, note: d.note }];
    }
    return [];
  });

  return {
    id: mod.id,
    slug: mod.slug,
    title: mod.title,
    summary: mod.summary,
    descriptionHtml: mod.descriptionHtml,
    status: mod.status,
    author: mod.author,
    category: { slug: mod.category.slug, name: locale === "cs" ? mod.category.nameCs : mod.category.nameSk },
    subcategory: mod.subcategory ? { slug: mod.subcategory.slug, name: locale === "cs" ? mod.subcategory.nameCs : mod.subcategory.nameSk } : null,
    vehicleModel: mod.vehicleModel,
    tags: mod.tags,
    brands: mod.brands.map((b) => b.brand),
    operators: mod.operators.map((o) => o.operator),
    credits: mod.credits.map((c) => ({ name: c.name, role: c.role, username: c.user?.username ?? null })),
    licenseTerms: mod.licenseTerms,
    licenseNote: mod.licenseNote,
    youtubeVideoId: mod.youtubeVideoId,
    requires4GbPatch: mod.requires4GbPatch,
    downloadCount: mod.downloadCount,
    followerCount: mod.followerCount,
    ratingAvg: mod.ratingAvg,
    ratingCount: mod.ratingCount,
    publishedAt: mod.publishedAt,
    lastUpdatedAt: mod.lastUpdatedAt,
    currentVersion: mod.currentVersion?.version ?? null,
    images: mod.images,
    dependencies,
    center,
    changelog: mod.versions.map((v) => ({ version: v.version, publishedAt: v.publishedAt as Date, html: v.changelogHtml })),
    plannedRelease: mod.plannedRelease,
    canEdit: canEditMod(viewer, mod),
  };
}

export type ModDetail = ModDetailResult;
