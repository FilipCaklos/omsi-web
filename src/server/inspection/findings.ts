/** Výsledky kontroly súboru. Kódy sa prekladajú v UI, server ukladá iba kód + detail. */
export const REJECT_FINDINGS = [
  "MAGIC_MISMATCH",
  "EXECUTABLE_FILE",
  "PATH_TRAVERSAL",
  "ABSOLUTE_PATH",
  "SYMLINK",
  "BLOCKED_EXTENSION",
  "BIDI_FILENAME",
  "ENCRYPTED",
  "TOO_MANY_ENTRIES",
  "TOO_LARGE_UNCOMPRESSED",
  "CORRUPT_ARCHIVE",
  "NOT_TEXT",
] as const;

export const REVIEW_FINDINGS = [
  "NATIVE_PLUGIN",
  "NESTED_ARCHIVE",
  "SUSPICIOUS_RATIO",
  "INSPECTOR_UNAVAILABLE",
] as const;

export type FindingCode = (typeof REJECT_FINDINGS)[number] | (typeof REVIEW_FINDINGS)[number];

export type Finding = { code: FindingCode; path?: string };

export type ScanVerdict = "CLEAN" | "REQUIRES_MOD_INSPECTION" | "REJECTED";

export function verdictFor(findings: readonly Finding[]): ScanVerdict {
  if (findings.some((f) => (REJECT_FINDINGS as readonly string[]).includes(f.code))) return "REJECTED";
  if (findings.length > 0) return "REQUIRES_MOD_INSPECTION";
  return "CLEAN";
}

/** Rovnaké nálezy sa zlúčia, uloží sa max. 50 príkladov (ochrana veľkosti DB riadku). */
export function compactFindings(findings: readonly Finding[]): Finding[] {
  const seen = new Set<string>();
  const result: Finding[] = [];
  for (const finding of findings) {
    const key = `${finding.code}|${finding.path ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(finding);
    if (result.length >= 50) break;
  }
  return result;
}
