import "server-only";
import sharp, { type Metadata, type Sharp } from "sharp";
import type { ImageKind } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { fileExtension, isImageExtension } from "@/lib/upload-policy";
import { HttpError } from "@/server/http";
import { canManageOwned } from "@/lib/rbac";
import type { CurrentUser } from "@/server/session";
import { newImageKeys, storage } from "@/server/storage";

/** Bezpečnostné limity dekódovania (ochrana proti „pixel bombám“). */
const MAX_INPUT_PIXELS = 60_000_000;
const MIN_WIDTH = 640;
const MIN_HEIGHT = 360;
export const THUMB = { width: 640, height: 360 } as const;
const FULL_MAX = { width: 2560, height: 1440 } as const;

type ImageMagic = "jpeg" | "png" | "webp";

function detectImage(buf: Buffer): ImageMagic | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length >= 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  return null;
}

export type ProcessedImage = { thumb: Buffer; full: Buffer; width: number; height: number };

/**
 * Screenshot sa VŽDY znovu zakóduje cez sharp do WebP:
 *  - zničí prípadný polyglot payload (HTML/JS prilepený za obrázkom),
 *  - odstráni všetky metadáta vrátane EXIF a GPS (sharp ich bez withMetadata() nekopíruje),
 *  - otočí podľa EXIF orientácie, vytvorí 16:9 náhľad 640×360 a plnú verziu max. 2560×1440.
 */
export async function processScreenshot(input: Buffer, filename: string): Promise<ProcessedImage> {
  const ext = fileExtension(filename);
  if (!isImageExtension(ext)) throw new HttpError(400, "IMAGE_TYPE_NOT_ALLOWED");
  const magic = detectImage(input);
  if (!magic) throw new HttpError(400, "IMAGE_INVALID");
  const declared = ext === "jpg" ? "jpeg" : ext;
  if (declared !== magic) throw new HttpError(400, "IMAGE_TYPE_MISMATCH");

  let pipeline: Sharp;
  let meta: Metadata;
  try {
    pipeline = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error", animated: false }).rotate();
    meta = await pipeline.metadata();
  } catch {
    throw new HttpError(400, "IMAGE_INVALID");
  }
  const rotated = (meta.orientation ?? 1) >= 5;
  const width = rotated ? (meta.height ?? 0) : (meta.width ?? 0);
  const height = rotated ? (meta.width ?? 0) : (meta.height ?? 0);
  if (width < MIN_WIDTH || height < MIN_HEIGHT) throw new HttpError(400, "IMAGE_TOO_SMALL", { minWidth: MIN_WIDTH, minHeight: MIN_HEIGHT });

  try {
    const fullResult = await pipeline
      .clone()
      .resize({ width: FULL_MAX.width, height: FULL_MAX.height, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 86, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    const thumb = await pipeline
      .clone()
      .resize({ width: THUMB.width, height: THUMB.height, fit: "cover", position: "attention" })
      .webp({ quality: 78, effort: 4 })
      .toBuffer();
    return { thumb, full: fullResult.data, width: fullResult.info.width, height: fullResult.info.height };
  } catch {
    throw new HttpError(400, "IMAGE_INVALID");
  }
}

/** Uloží spracovaný screenshot. Bez modId zostane nepriradený (Upload Wizard ho priradí, inak ho zmaže upratovanie). */
export async function storeScreenshot(params: {
  user: CurrentUser;
  input: Buffer;
  filename: string;
  kind: Extract<ImageKind, "SCREENSHOT" | "DEVLOG">;
  modId: string | null;
}) {
  if (params.input.length > env().UPLOAD_MAX_IMAGE_BYTES) throw new HttpError(413, "IMAGE_TOO_LARGE");

  if (params.modId) {
    const mod = await db().mod.findUnique({
      where: { id: params.modId },
      select: { author: { select: { id: true, role: true } } },
    });
    if (!mod || !canManageOwned(params.user, mod.author, "mod:edit-own", "mod:edit-any")) {
      throw new HttpError(404, "MOD_NOT_FOUND");
    }
  }

  const processed = await processScreenshot(params.input, params.filename);
  const keys = newImageKeys();
  const target = storage();
  await target.putBuffer(keys.thumb, processed.thumb, "image/webp");
  await target.putBuffer(keys.full, processed.full, "image/webp");

  const sortOrder = params.modId
    ? await db().mediaImage.count({ where: { modId: params.modId, kind: params.kind } })
    : 0;
  return db().mediaImage.create({
    data: {
      kind: params.kind,
      ownerId: params.user.id,
      modId: params.modId,
      storageKey: keys.thumb,
      fullKey: keys.full,
      storageDriver: target.driver,
      width: processed.width,
      height: processed.height,
      sizeBytes: processed.full.length,
      sortOrder,
      isPrimary: params.modId !== null && sortOrder === 0,
    },
    select: { id: true, width: true, height: true, sortOrder: true, isPrimary: true },
  });
}
