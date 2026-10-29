import "server-only";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { assertValidKey, type ByteRange, type StorageProvider } from "./types";

/**
 * Úložisko na lokálnom disku (Docker volume) mimo public/.
 * Súbory sa nikdy neservírujú priamo – iba cez chránený download/media route handler.
 */
export class LocalDiskStorage implements StorageProvider {
  readonly driver = "LOCAL_DISK" as const;
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  /** Absolútna cesta s kontrolou, že neopustí koreň úložiska. */
  resolve(key: string): string {
    assertValidKey(key);
    const full = path.resolve(this.root, "objects", ...key.split("/"));
    if (!full.startsWith(path.join(this.root, "objects") + path.sep)) {
      throw new Error("Cesta mimo úložiska");
    }
    return full;
  }

  async putFile(key: string, localPath: string): Promise<void> {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    try {
      // Temp adresár je na rovnakom volume → atómový presun bez kopírovania gigabajtov
      await rename(localPath, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
      await copyFile(localPath, target);
      await unlink(localPath);
    }
  }

  async putBuffer(key: string, body: Buffer): Promise<void> {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.${process.pid}.tmp`;
    await writeFile(temp, body, { mode: 0o640 });
    await rename(temp, target);
  }

  async read(key: string, range?: ByteRange): Promise<Readable> {
    const file = this.resolve(key);
    return createReadStream(file, range ? { start: range.start, end: range.end, highWaterMark: 256 * 1024 } : { highWaterMark: 256 * 1024 });
  }

  async size(key: string): Promise<number | null> {
    try {
      const info = await stat(this.resolve(key));
      return info.isFile() ? info.size : null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }
}
