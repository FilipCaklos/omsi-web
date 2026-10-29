import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";
import { LocalDiskStorage } from "./local-disk";
import { S3CompatibleStorage } from "./s3";
import type { StorageDriverName, StorageProvider } from "./types";

export type { ByteRange, StorageProvider } from "./types";

const globalForStorage = globalThis as unknown as { storage?: Map<StorageDriverName, StorageProvider> };

function create(driver: StorageDriverName): StorageProvider {
  const e = env();
  if (driver === "S3_COMPATIBLE") {
    return new S3CompatibleStorage({
      endpoint: e.S3_ENDPOINT,
      region: e.S3_REGION,
      bucket: e.S3_BUCKET,
      accessKeyId: e.S3_ACCESS_KEY_ID,
      secretAccessKey: e.S3_SECRET_ACCESS_KEY,
      forcePathStyle: e.S3_FORCE_PATH_STYLE,
    });
  }
  return new LocalDiskStorage(e.STORAGE_LOCAL_ROOT);
}

/**
 * Úložisko podľa ovládača. Nové súbory idú do aktuálneho STORAGE_DRIVER,
 * staršie sa čítajú z ovládača uloženého pri súbore (bezpečná migrácia LOCAL → S3).
 */
export function storage(driver: StorageDriverName = env().STORAGE_DRIVER): StorageProvider {
  globalForStorage.storage ??= new Map();
  let provider = globalForStorage.storage.get(driver);
  if (!provider) {
    provider = create(driver);
    globalForStorage.storage.set(driver, provider);
  }
  return provider;
}

/** Pracovný adresár pre rozpracované uploady – vždy lokálny disk (aj pri S3). */
export async function uploadTempDir(): Promise<string> {
  const dir = path.resolve(env().STORAGE_LOCAL_ROOT, "tmp", "uploads");
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function uploadTempPath(uploadId: string): Promise<string> {
  if (!/^[a-z0-9]{10,40}$/.test(uploadId)) throw new Error("Neplatné ID uploadu");
  return path.join(await uploadTempDir(), `${uploadId}.part`);
}

/** Kľúč pre hotový súbor modu: files/2026/10/<náhodné-id>.<prípona> */
export function newFileKey(extension: string): string {
  const now = new Date();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `files/${now.getUTCFullYear()}/${month}/${randomUUID()}.${extension.replace(/^\./, "")}`;
}

export function newImageKeys(): { thumb: string; full: string } {
  const now = new Date();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const id = randomUUID();
  const base = `images/${now.getUTCFullYear()}/${month}/${id}`;
  return { thumb: `${base}-thumb.webp`, full: `${base}-full.webp` };
}
