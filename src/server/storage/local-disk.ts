import "server-only";
import { copyFile, mkdir, open, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
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
      // Iný disk: kópia vedľa cieľa a až potom atómový rename – pod kľúčom nikdy nie je polovičný súbor
      const temp = `${target}.${process.pid}.tmp`;
      try {
        await copyFile(localPath, temp);
        await rename(temp, target);
      } catch (copyError) {
        await rm(temp, { force: true });
        throw copyError;
      }
      await unlink(localPath);
    }
  }

  async putBuffer(key: string, body: Buffer): Promise<void> {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.${process.pid}.tmp`;
    try {
      await writeFile(temp, body, { mode: 0o640 });
      await rename(temp, target);
    } catch (error) {
      await rm(temp, { force: true });
      throw error;
    }
  }

  async read(key: string, range?: ByteRange): Promise<Readable> {
    // Súbor sa otvorí vopred: chýbajúci objekt vyhodí chybu ešte pred odoslaním hlavičiek odpovede
    const handle = await open(this.resolve(key), "r");
    return handle.createReadStream({ ...(range ?? {}), highWaterMark: 256 * 1024, autoClose: true });
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
