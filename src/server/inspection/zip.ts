import yauzl from "yauzl";
import type { RawEntry } from "./entries";

const S_IFMT = 0o170000;
const S_IFLNK = 0o120000;

export class ArchiveReadError extends Error {
  constructor(
    public readonly code: "PATH_TRAVERSAL" | "CORRUPT_ARCHIVE" | "TOO_MANY_ENTRIES",
    message: string,
  ) {
    super(message);
    this.name = "ArchiveReadError";
  }
}

/**
 * Prečíta centrálny adresár ZIP archívu bez rozbaľovania obsahu.
 * yauzl odmieta absolútne cesty a „..“ – takú chybu hlásime ako PATH_TRAVERSAL.
 */
export function listZipEntries(filePath: string, maxEntries: number): Promise<RawEntry[]> {
  return new Promise((resolve, reject) => {
    yauzl.open(
      filePath,
      { lazyEntries: true, autoClose: true, decodeStrings: true, validateEntrySizes: true, strictFileNames: false },
      (openError, zip) => {
        if (openError || !zip) {
          reject(new ArchiveReadError("CORRUPT_ARCHIVE", openError?.message ?? "Archív sa nedá otvoriť"));
          return;
        }
        if (zip.entryCount > maxEntries) {
          zip.close();
          reject(new ArchiveReadError("TOO_MANY_ENTRIES", `${zip.entryCount} položiek`));
          return;
        }
        const entries: RawEntry[] = [];
        zip.on("entry", (entry: yauzl.Entry) => {
          const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff;
          entries.push({
            path: entry.fileName,
            size: entry.uncompressedSize,
            compressedSize: entry.compressedSize,
            isDirectory: entry.fileName.endsWith("/"),
            isSymlink: (unixMode & S_IFMT) === S_IFLNK,
            isEncrypted: entry.isEncrypted(),
          });
          zip.readEntry();
        });
        zip.on("end", () => resolve(entries));
        zip.on("error", (error: Error) => {
          const traversal = /relative path|absolute path|invalid characters/i.test(error.message);
          reject(new ArchiveReadError(traversal ? "PATH_TRAVERSAL" : "CORRUPT_ARCHIVE", error.message));
        });
        zip.readEntry();
      },
    );
  });
}
