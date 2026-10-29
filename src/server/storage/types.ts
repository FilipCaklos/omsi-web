import type { Readable } from "node:stream";

export type StorageDriverName = "LOCAL_DISK" | "S3_COMPATIBLE";

/** Rozsah bajtov vrátane oboch hraníc (ako v HTTP Range). */
export type ByteRange = { start: number; end: number };

export interface StorageProvider {
  readonly driver: StorageDriverName;
  /** Presunie (alebo nahrá) hotový lokálny súbor do úložiska pod daným kľúčom. */
  putFile(key: string, localPath: string, contentType: string): Promise<void>;
  /** Uloží malý obsah (náhľady obrázkov). */
  putBuffer(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Stream celého súboru alebo rozsahu. */
  read(key: string, range?: ByteRange): Promise<Readable>;
  /** Veľkosť v bajtoch, alebo null ak objekt neexistuje. */
  size(key: string): Promise<number | null>;
  delete(key: string): Promise<void>;
}

const KEY_PATTERN = /^[a-z0-9][a-z0-9/_.-]{0,500}$/;

/** Kľúče generuje výhradne server – aj tak ich validujeme proti path traversal. */
export function assertValidKey(key: string): void {
  if (!KEY_PATTERN.test(key) || key.includes("..") || key.includes("//") || key.endsWith("/")) {
    throw new Error(`Neplatný kľúč úložiska: ${key}`);
  }
}
