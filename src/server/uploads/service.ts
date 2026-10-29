import "server-only";
import { randomUUID } from "node:crypto";
import { open, rm, statfs, truncate } from "node:fs/promises";
import { z } from "zod";
import type { FileKind, ModFile, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { redis } from "@/lib/redis";
import { MOD_FILE_MIME, fileExtension, isModFileExtension, sanitizeFilename, type ModFileExtension } from "@/lib/upload-policy";
import { audit } from "@/server/audit";
import { HttpError } from "@/server/http";
import { inspectFile } from "@/server/inspection/inspect";
import { RATE_LIMITS, consumeRateLimit } from "@/server/security/rate-limit";
import { getSettings } from "@/server/settings";
import type { CurrentUser } from "@/server/session";
import { newFileKey, storage, uploadTempDir, uploadTempPath } from "@/server/storage";

/** Rezerva voľného miesta na disku nad veľkosť nahrávaného súboru */
const DISK_HEADROOM_BYTES = 2 * 1024 ** 3;
/** Ako často bežiaca kontrola potvrdí, že žije; upratovanie považuje SCANNING bez heartbeatu 2 h za zaseknutý */
const SCAN_HEARTBEAT_MS = 10 * 60 * 1000;
const SCAN_STALE_MS = 2 * 60 * 60 * 1000;

export const initUploadSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().positive(),
  modId: z.string().regex(/^[a-z0-9]{10,40}$/).optional(),
});

export type UploadStatusDto = {
  id: string;
  filename: string;
  sizeBytes: number;
  chunkSize: number;
  totalChunks: number;
  receivedChunks: number;
  receivedBytes: number;
  status: string;
  errorCode: string | null;
  sha256: string | null;
  scanStatus: string | null;
  findings: unknown;
  archiveFormat: string | null;
  archiveEntryCount: number | null;
  omsiFolders: string[];
  expiresAt: string;
};

type UploadRow = Prisma.UploadSessionGetPayload<object>;

export function toDto(row: UploadRow): UploadStatusDto {
  const notes = (row.scanNotes ?? null) as { findings?: unknown } | null;
  return {
    id: row.id,
    filename: row.filename,
    sizeBytes: Number(row.sizeBytes),
    chunkSize: row.chunkSize,
    totalChunks: row.totalChunks,
    receivedChunks: row.receivedChunks,
    receivedBytes: Number(row.receivedBytes),
    status: row.status,
    errorCode: row.errorCode,
    sha256: row.sha256,
    scanStatus: row.scanStatus,
    findings: notes?.findings ?? [],
    archiveFormat: row.archiveFormat,
    archiveEntryCount: row.archiveEntryCount,
    omsiFolders: row.omsiFolders,
    expiresAt: row.expiresAt.toISOString(),
  };
}

function expiry(): Date {
  return new Date(Date.now() + env().UPLOAD_EXPIRY_HOURS * 60 * 60 * 1000);
}

async function ownedUpload(user: CurrentUser, uploadId: string): Promise<UploadRow> {
  if (!/^[a-z0-9]{10,40}$/.test(uploadId)) throw new HttpError(404, "UPLOAD_NOT_FOUND");
  const row = await db().uploadSession.findUnique({ where: { id: uploadId } });
  // Cudzí upload sa tvári ako neexistujúci (neprezrádzame ID)
  if (!row || row.userId !== user.id) throw new HttpError(404, "UPLOAD_NOT_FOUND");
  return row;
}

// ───────────────────────────── 1) Inicializácia ─────────────────────────────

export async function initUpload(user: CurrentUser, input: unknown, headers: Headers): Promise<UploadStatusDto> {
  if (!user.emailVerified) throw new HttpError(403, "EMAIL_NOT_VERIFIED");
  const parsed = initUploadSchema.safeParse(input);
  if (!parsed.success) throw new HttpError(400, "INVALID_INPUT");
  const e = env();

  const filename = sanitizeFilename(parsed.data.filename);
  const extension = fileExtension(filename);
  const settings = await getSettings();
  if (!settings.uploadsEnabled) throw new HttpError(503, "UPLOADS_DISABLED");
  if (!isModFileExtension(extension)) throw new HttpError(400, "EXTENSION_NOT_ALLOWED", { allowed: Object.keys(MOD_FILE_MIME) });
  if (parsed.data.sizeBytes > settings.maxFileBytes) {
    throw new HttpError(413, "FILE_TOO_LARGE", { maxBytes: settings.maxFileBytes });
  }

  if (parsed.data.modId) {
    const mod = await db().mod.findUnique({ where: { id: parsed.data.modId }, select: { authorId: true } });
    if (!mod || mod.authorId !== user.id) throw new HttpError(404, "MOD_NOT_FOUND");
  }

  const limit = await consumeRateLimit(RATE_LIMITS.uploadInit, user.id);
  if (!limit.allowed) {
    throw new HttpError(limit.unavailable ? 503 : 429, limit.unavailable ? "SERVICE_UNAVAILABLE" : "RATE_LIMITED", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const active = await db().uploadSession.count({
    where: { userId: user.id, status: { in: ["UPLOADING", "ASSEMBLING", "SCANNING"] }, expiresAt: { gt: new Date() } },
  });
  if (active >= settings.maxActiveUploads) throw new HttpError(429, "TOO_MANY_ACTIVE_UPLOADS");

  // Ochrana proti vyčerpaniu disku: musí sa zmestiť celý súbor + rezerva
  const fs = await statfs(await uploadTempDir());
  const freeBytes = fs.bavail * fs.bsize;
  if (freeBytes < parsed.data.sizeBytes + DISK_HEADROOM_BYTES) throw new HttpError(507, "INSUFFICIENT_STORAGE");

  const chunkSize = e.UPLOAD_CHUNK_BYTES;
  const row = await db().uploadSession.create({
    data: {
      userId: user.id,
      purpose: "MOD_FILE",
      filename,
      extension,
      sizeBytes: BigInt(parsed.data.sizeBytes),
      chunkSize,
      totalChunks: Math.ceil(parsed.data.sizeBytes / chunkSize),
      modId: parsed.data.modId ?? null,
      expiresAt: expiry(),
    },
  });
  await audit({
    action: "file.uploaded",
    actorId: user.id,
    targetType: "upload",
    targetId: row.id,
    metadata: { stage: "init", filename, sizeBytes: parsed.data.sizeBytes },
    headers,
  });
  return toDto(row);
}

// ───────────────────────────── 2) Chunk ─────────────────────────────

async function withUploadLock<T>(uploadId: string, task: () => Promise<T>): Promise<T> {
  const key = `upload:lock:${uploadId}`;
  const token = randomUUID();
  let acquired: string | null;
  try {
    acquired = await redis().set(key, token, "PX", 5 * 60 * 1000, "NX");
  } catch {
    throw new HttpError(503, "SERVICE_UNAVAILABLE");
  }
  if (acquired !== "OK") throw new HttpError(409, "CHUNK_IN_PROGRESS");
  try {
    return await task();
  } finally {
    // Uvoľníme iba vlastný zámok
    await redis()
      .eval("if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0", 1, key, token)
      .catch(() => undefined);
  }
}

/**
 * Prijme jeden chunk. Upload je sekvenčný (chunk N až po N-1), takže sa dá kedykoľvek naviazať:
 * klient sa opýta na `receivedChunks` a pokračuje ďalším. Opakovaný už prijatý chunk je idempotentný.
 */
export async function writeChunk(
  user: CurrentUser,
  uploadId: string,
  index: number,
  body: ReadableStream<Uint8Array> | null,
  declaredLength: number | null,
): Promise<UploadStatusDto> {
  const initial = await ownedUpload(user, uploadId);
  if (initial.status !== "UPLOADING") throw new HttpError(409, "UPLOAD_NOT_ACTIVE", { status: initial.status });
  if (initial.expiresAt.getTime() < Date.now()) throw new HttpError(410, "UPLOAD_EXPIRED");
  if (!Number.isInteger(index) || index < 0 || index >= initial.totalChunks) throw new HttpError(400, "INVALID_CHUNK_INDEX");
  if (index < initial.receivedChunks) return toDto(initial);
  if (index > initial.receivedChunks) throw new HttpError(409, "CHUNK_OUT_OF_ORDER", { expected: initial.receivedChunks });
  if (!body) throw new HttpError(400, "EMPTY_CHUNK");

  const size = Number(initial.sizeBytes);
  const offset = index * initial.chunkSize;
  const expected = Math.min(initial.chunkSize, size - offset);
  if (declaredLength !== null && declaredLength !== expected) {
    throw new HttpError(400, "CHUNK_SIZE_MISMATCH", { expected });
  }

  return withUploadLock(uploadId, async () => {
    // Stav znovu po získaní zámku (súbežný klient mohol chunk práve zapísať)
    const row = await ownedUpload(user, uploadId);
    if (index < row.receivedChunks) return toDto(row);
    if (index !== row.receivedChunks) throw new HttpError(409, "CHUNK_OUT_OF_ORDER", { expected: row.receivedChunks });

    const tempPath = await uploadTempPath(uploadId);
    const handle = await open(tempPath, index === 0 ? "w" : "r+", 0o640);
    let written = 0;
    try {
      const reader = body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (written + value.byteLength > expected) {
          await reader.cancel();
          throw new HttpError(400, "CHUNK_SIZE_MISMATCH", { expected });
        }
        await handle.write(value, 0, value.byteLength, offset + written);
        written += value.byteLength;
      }
      if (written !== expected) throw new HttpError(400, "CHUNK_SIZE_MISMATCH", { expected, received: written });
    } catch (error) {
      await handle.close();
      // Neúplný chunk odrežeme, aby ďalší pokus začal na čistej hranici
      await truncate(tempPath, offset).catch(() => undefined);
      throw error;
    }
    await handle.close();

    const updated = await db().uploadSession.updateMany({
      where: { id: uploadId, receivedChunks: index, status: "UPLOADING" },
      data: { receivedChunks: index + 1, receivedBytes: { increment: BigInt(written) }, expiresAt: expiry() },
    });
    if (updated.count !== 1) throw new HttpError(409, "UPLOAD_STATE_CHANGED");
    return toDto(await ownedUpload(user, uploadId));
  });
}

export async function getUploadStatus(user: CurrentUser, uploadId: string): Promise<UploadStatusDto> {
  return toDto(await ownedUpload(user, uploadId));
}

// ───────────────────────────── 3) Dokončenie a kontrola ─────────────────────────────

export async function completeUpload(user: CurrentUser, uploadId: string): Promise<UploadStatusDto> {
  const row = await ownedUpload(user, uploadId);
  if (row.status !== "UPLOADING") return toDto(row);
  if (row.receivedChunks !== row.totalChunks || row.receivedBytes !== row.sizeBytes) {
    throw new HttpError(409, "UPLOAD_INCOMPLETE", { receivedChunks: row.receivedChunks, totalChunks: row.totalChunks });
  }
  const claimed = await db().uploadSession.updateMany({
    where: { id: uploadId, status: "UPLOADING" },
    data: { status: "SCANNING" },
  });
  if (claimed.count !== 1) return toDto(await ownedUpload(user, uploadId));
  return toDto(await ownedUpload(user, uploadId));
}

/**
 * Kontrola + presun do úložiska. Beží po odoslaní odpovede (viacgigabajtový SHA-256 trvá),
 * klient medzitým sleduje stav cez GET /api/uploads/[id].
 */
export async function processUpload(uploadId: string): Promise<void> {
  const row = await db().uploadSession.findUnique({ where: { id: uploadId } });
  if (!row || row.status !== "SCANNING") return;
  const tempPath = await uploadTempPath(uploadId);
  const e = env();
  // Kontrola viacgigabajtového súboru môže trvať dlho – pravidelný „heartbeat“ (updatedAt)
  // zabráni upratovaniu, aby ju považovalo za zaseknutú a zmazalo súbor počas spracovania
  const heartbeat = setInterval(() => {
    void db()
      .uploadSession.updateMany({ where: { id: uploadId, status: "SCANNING" }, data: { updatedAt: new Date() } })
      .catch(() => undefined);
  }, SCAN_HEARTBEAT_MS);

  try {
    const result = await inspectFile(tempPath, row.extension as ModFileExtension, {
      sevenZipPath: e.SEVEN_ZIP_PATH,
      maxEntries: e.ARCHIVE_MAX_ENTRIES,
      maxUncompressedBytes: e.ARCHIVE_MAX_UNCOMPRESSED_BYTES,
    });
    const scanNotes = {
      findings: result.findings,
      installPrefix: result.installPrefix,
      entriesTruncated: result.entriesTruncated,
    } satisfies Prisma.InputJsonObject;

    if (result.verdict === "REJECTED") {
      await rm(tempPath, { force: true });
      await db().uploadSession.update({
        where: { id: uploadId },
        data: { status: "FAILED", errorCode: "REJECTED", scanStatus: "REJECTED", sha256: result.sha256, scanNotes },
      });
      await audit({
        action: "file.rejected",
        actorId: row.userId,
        targetType: "upload",
        targetId: uploadId,
        metadata: { findings: result.findings.map((f) => f.code), sha256: result.sha256 },
      });
      return;
    }

    const key = newFileKey(row.extension);
    const mimeType = MOD_FILE_MIME[row.extension as ModFileExtension];
    const target = storage();
    await target.putFile(key, tempPath, mimeType);
    await db().uploadSession.update({
      where: { id: uploadId },
      data: {
        status: "COMPLETED",
        sha256: result.sha256,
        storageKey: key,
        storageDriver: target.driver,
        mimeType,
        archiveFormat: result.archiveFormat,
        archiveEntries: result.entries ?? undefined,
        archiveEntryCount: result.entryCount,
        archiveUncompressedBytes: result.uncompressedBytes === null ? null : BigInt(result.uncompressedBytes),
        omsiFolders: result.omsiFolders,
        scanStatus: result.verdict,
        scanNotes,
        // Hotový, no ešte nepriradený upload si autor môže pripojiť k modu do 7 dní
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    await audit({
      action: "file.uploaded",
      actorId: row.userId,
      targetType: "upload",
      targetId: uploadId,
      metadata: { stage: "completed", sha256: result.sha256, verdict: result.verdict },
    });
  } catch (error) {
    console.error("[upload] spracovanie zlyhalo", uploadId, error);
    await rm(tempPath, { force: true });
    await db().uploadSession.update({ where: { id: uploadId }, data: { status: "FAILED", errorCode: "PROCESSING_FAILED" } });
  } finally {
    clearInterval(heartbeat);
  }
}

export async function cancelUpload(user: CurrentUser, uploadId: string): Promise<void> {
  const row = await ownedUpload(user, uploadId);
  if (row.resultFileId) throw new HttpError(409, "UPLOAD_ALREADY_ATTACHED");
  if (row.status === "SCANNING") throw new HttpError(409, "UPLOAD_PROCESSING");
  await rm(await uploadTempPath(uploadId), { force: true });
  if (row.storageKey) await storage(row.storageDriver ?? undefined).delete(row.storageKey);
  await db().uploadSession.update({ where: { id: uploadId }, data: { status: "EXPIRED", storageKey: null, errorCode: "CANCELLED" } });
}

// ───────────────────────────── 4) Pripojenie k modu ─────────────────────────────

export type AttachInput = {
  uploadId: string;
  modId: string;
  versionId: string;
  kind: FileKind;
  displayName: string;
  description?: string;
  patchForFileId?: string | null;
  mirrorUrl?: string | null;
  mirrorLabel?: string | null;
  sortOrder?: number;
};

/**
 * Vytvorí ModFile z hotového uploadu (volá Upload Wizard). Kontrola vlastníctva je na volajúcom.
 * Beží v transakcii: upload sa „zaberie“ podmieneným update, takže dvojklik nevytvorí dva súbory
 * nad tým istým objektom v úložisku (zmazanie jedného by rozbilo druhý).
 */
export async function createModFileFromUpload(userId: string, input: AttachInput, tx?: Prisma.TransactionClient): Promise<ModFile> {
  if (!tx) return db().$transaction((inner) => createModFileFromUpload(userId, input, inner));

  const upload = await tx.uploadSession.findUnique({ where: { id: input.uploadId } });
  if (!upload || upload.userId !== userId) throw new HttpError(404, "UPLOAD_NOT_FOUND");
  if (upload.status !== "COMPLETED" || !upload.storageKey || !upload.sha256 || !upload.scanStatus || !upload.mimeType) {
    throw new HttpError(409, "UPLOAD_NOT_READY");
  }
  if (upload.resultFileId) throw new HttpError(409, "UPLOAD_ALREADY_ATTACHED");

  const file = await tx.modFile.create({
    data: {
      modId: input.modId,
      versionId: input.versionId,
      kind: input.kind,
      displayName: input.displayName,
      description: input.description ?? "",
      originalFilename: upload.filename,
      extension: upload.extension,
      mimeType: upload.mimeType,
      sizeBytes: upload.sizeBytes,
      sha256: upload.sha256,
      storageDriver: upload.storageDriver ?? env().STORAGE_DRIVER,
      storageKey: upload.storageKey,
      archiveFormat: upload.archiveFormat ?? "NONE",
      archiveEntries: upload.archiveEntries ?? undefined,
      archiveEntryCount: upload.archiveEntryCount ?? 0,
      archiveUncompressedBytes: upload.archiveUncompressedBytes,
      omsiFolders: upload.omsiFolders,
      scanStatus: upload.scanStatus,
      scanNotes: upload.scanNotes ?? undefined,
      patchForFileId: input.patchForFileId ?? null,
      mirrorUrl: input.mirrorUrl ?? null,
      mirrorLabel: input.mirrorLabel ?? null,
      sortOrder: input.sortOrder ?? 0,
      uploaderId: userId,
    },
  });
  // Súbežná požiadavka čaká na zámok riadku a po commite prvej už nenájde resultFileId = null
  const claimed = await tx.uploadSession.updateMany({ where: { id: upload.id, resultFileId: null }, data: { resultFileId: file.id } });
  if (claimed.count !== 1) throw new HttpError(409, "UPLOAD_ALREADY_ATTACHED");
  return file;
}

// ───────────────────────────── 5) Upratovanie ─────────────────────────────

/** Zmaže nedokončené/expirované uploady a nepriradené obrázky. Volá plánovač (src/server/jobs). */
export async function cleanupExpiredUploads(now = new Date()): Promise<{ uploads: number; images: number }> {
  const stuckScanning = new Date(now.getTime() - SCAN_STALE_MS);
  const expired = await db().uploadSession.findMany({
    where: {
      resultFileId: null,
      OR: [
        { status: { in: ["UPLOADING", "ASSEMBLING", "COMPLETED", "FAILED"] }, expiresAt: { lt: now } },
        { status: "SCANNING", updatedAt: { lt: stuckScanning } },
      ],
    },
    select: { id: true, status: true, updatedAt: true, storageKey: true, storageDriver: true },
    take: 500,
  });
  let removed = 0;
  for (const upload of expired) {
    // Najprv podmienene prepnúť stav: ak medzitým prišiel heartbeat alebo pripojenie k modu, súbor nemažeme
    const claimed = await db().uploadSession.updateMany({
      where: { id: upload.id, status: upload.status, updatedAt: upload.updatedAt, resultFileId: null },
      data: { status: "EXPIRED", storageKey: null, errorCode: "EXPIRED" },
    });
    if (claimed.count !== 1) continue;
    removed += 1;
    await rm(await uploadTempPath(upload.id), { force: true });
    if (upload.storageKey) await storage(upload.storageDriver ?? undefined).delete(upload.storageKey).catch(() => undefined);
  }

  const orphanBefore = new Date(now.getTime() - env().UPLOAD_EXPIRY_HOURS * 60 * 60 * 1000);
  const orphans = await db().mediaImage.findMany({
    where: { modId: null, devlogId: null, kind: { in: ["SCREENSHOT", "DEVLOG"] }, createdAt: { lt: orphanBefore } },
    select: { id: true, storageKey: true, fullKey: true, storageDriver: true },
    take: 500,
  });
  for (const image of orphans) {
    await storage(image.storageDriver).delete(image.storageKey).catch(() => undefined);
    await storage(image.storageDriver).delete(image.fullKey).catch(() => undefined);
    await db().mediaImage.delete({ where: { id: image.id } });
  }
  return { uploads: removed, images: orphans.length };
}
