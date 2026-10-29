import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import type { ModFileExtension } from "@/lib/upload-policy";
import { analyzeEntries, type RawEntry, type StoredEntry } from "./entries";
import { compactFindings, verdictFor, type Finding, type ScanVerdict } from "./findings";
import { detectFormat, looksLikeText, readHead, type DetectedFormat } from "./magic";
import { listWithSevenZip } from "./seven-zip";
import { ArchiveReadError, listZipEntries } from "./zip";

export type ArchiveFormatName = "ZIP" | "SEVEN_Z" | "RAR" | "NONE";

export type InspectionResult = {
  verdict: ScanVerdict;
  findings: Finding[];
  sha256: string;
  archiveFormat: ArchiveFormatName;
  entries: StoredEntry[] | null;
  entryCount: number;
  uncompressedBytes: number | null;
  omsiFolders: string[];
  installPrefix: string | null;
  entriesTruncated: boolean;
};

export type InspectionOptions = {
  sevenZipPath: string;
  maxEntries: number;
  maxUncompressedBytes: number;
};

/** SHA-256 celého súboru streamovaním (konštantná pamäť aj pri 8 GB). */
export function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(filePath, { highWaterMark: 1024 * 1024 })
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", () => resolve(hash.digest("hex")));
  });
}

const EXPECTED_FORMAT: Partial<Record<ModFileExtension, DetectedFormat>> = {
  zip: "ZIP",
  "7z": "SEVEN_Z",
  rar: "RAR",
  pdf: "PDF",
};

const EXECUTABLE_FORMATS: ReadonlySet<DetectedFormat> = new Set(["PE", "ELF", "MACHO", "SHEBANG", "HTML"]);

/**
 * Kompletná kontrola nahraného súboru:
 *  1. magic bytes musia zodpovedať prípone (premenovaný .exe neprejde),
 *  2. archívy: zoznam súborov, Zip Slip, symlinky, spustiteľné súbory, .dll, vnorené archívy, zip bomby,
 *  3. SHA-256 celého súboru.
 */
export async function inspectFile(filePath: string, extension: ModFileExtension, options: InspectionOptions): Promise<InspectionResult> {
  const [head, sha256] = await Promise.all([readHead(filePath), sha256File(filePath)]);
  const detected = detectFormat(head);
  const findings: Finding[] = [];

  const base = (archiveFormat: ArchiveFormatName): InspectionResult => ({
    verdict: "CLEAN",
    findings: [],
    sha256,
    archiveFormat,
    entries: null,
    entryCount: 0,
    uncompressedBytes: null,
    omsiFolders: [],
    installPrefix: null,
    entriesTruncated: false,
  });
  const finish = (result: InspectionResult): InspectionResult => {
    const compact = compactFindings(result.findings);
    return { ...result, findings: compact, verdict: verdictFor(compact) };
  };

  if (EXECUTABLE_FORMATS.has(detected)) {
    return finish({ ...base("NONE"), findings: [{ code: "EXECUTABLE_FILE" }] });
  }

  // Prípona bez známeho formátu (.hof, .ams) nesmie skrývať archív ani PDF – inak by obišla kontrolu obsahu
  const expected = EXPECTED_FORMAT[extension] ?? "UNKNOWN";
  if (detected !== expected) {
    return finish({ ...base("NONE"), findings: [{ code: "MAGIC_MISMATCH" }] });
  }

  if (extension === "hof") {
    return finish({ ...base("NONE"), findings: looksLikeText(head) ? [] : [{ code: "NOT_TEXT" }] });
  }
  if (extension === "pdf" || extension === "ams") {
    // .ams/.pdf nemajú vnútornú štruktúru na kontrolu – stačí, že nie sú spustiteľné
    return finish(base("NONE"));
  }

  const format: ArchiveFormatName = extension === "zip" ? "ZIP" : extension === "7z" ? "SEVEN_Z" : "RAR";
  let raw: RawEntry[];

  if (format === "ZIP") {
    try {
      raw = await listZipEntries(filePath, options.maxEntries);
    } catch (error) {
      const code = error instanceof ArchiveReadError ? error.code : "CORRUPT_ARCHIVE";
      return finish({ ...base(format), findings: [{ code }] });
    }
  } else {
    const listed = await listWithSevenZip(options.sevenZipPath, filePath, options.maxEntries);
    if (!listed.ok) {
      const code =
        listed.reason === "UNAVAILABLE" ? "INSPECTOR_UNAVAILABLE"
        : listed.reason === "ENCRYPTED" ? "ENCRYPTED"
        : listed.reason === "TOO_MANY_ENTRIES" ? "TOO_MANY_ENTRIES"
        : "CORRUPT_ARCHIVE";
      return finish({ ...base(format), findings: [{ code }] });
    }
    raw = listed.entries;
  }

  const analysis = analyzeEntries(raw, { maxEntries: options.maxEntries, maxUncompressedBytes: options.maxUncompressedBytes });
  findings.push(...analysis.findings);

  return finish({
    ...base(format),
    findings,
    entries: analysis.entries,
    entryCount: analysis.entryCount,
    uncompressedBytes: analysis.uncompressedBytes,
    omsiFolders: analysis.omsiFolders,
    installPrefix: analysis.installPrefix,
    entriesTruncated: analysis.truncated,
  });
}
