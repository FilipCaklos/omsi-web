import {
  BLOCKED_INNER_EXTENSIONS,
  INSPECTION_INNER_EXTENSIONS,
  NESTED_ARCHIVE_EXTENSIONS,
  OMSI_ROOT_FOLDERS,
  fileExtension,
} from "@/lib/upload-policy";
import type { Finding } from "./findings";

/** Položka archívu tak, ako ju vráti čítačka (yauzl / 7zz). */
export type RawEntry = {
  path: string;
  size: number;
  compressedSize?: number;
  isDirectory: boolean;
  isSymlink?: boolean;
  isEncrypted?: boolean;
};

/** Položka uložená v DB pre strom „Zobraziť obsah archívu“ (krátke kľúče šetria miesto). */
export type StoredEntry = { p: string; s: number; d?: 1 };

export const MAX_STORED_ENTRIES = 10_000;

export type EntryAnalysis = {
  findings: Finding[];
  entries: StoredEntry[];
  entryCount: number;
  uncompressedBytes: number;
  omsiFolders: string[];
  /** "" = rozbaliť priamo do koreňa OMSI, "Názov/" = obsah tohto priečinka, null = neznáma štruktúra */
  installPrefix: string | null;
  truncated: boolean;
};

const BIDI_OR_CONTROL = /[\p{Cc}‎‏‪-‮⁦-⁩]/u;

/** Zjednotí oddeľovače a odhalí pokusy o únik z cieľového priečinka (Zip Slip). */
export function classifyPath(rawPath: string): { normalized: string; problem?: "PATH_TRAVERSAL" | "ABSOLUTE_PATH" | "BIDI_FILENAME" } {
  const unified = rawPath.replace(/\\/g, "/");
  if (BIDI_OR_CONTROL.test(unified)) return { normalized: unified, problem: "BIDI_FILENAME" };
  if (unified.startsWith("/") || /^[a-zA-Z]:/.test(unified) || unified.startsWith("//")) {
    return { normalized: unified, problem: "ABSOLUTE_PATH" };
  }
  const segments = unified.split("/").filter((s) => s.length > 0 && s !== ".");
  if (segments.some((s) => s === ".." || /^\.\.+$/.test(s.trim()))) return { normalized: unified, problem: "PATH_TRAVERSAL" };
  // Alternatívne dátové prúdy NTFS („súbor.txt:skryte.exe“)
  if (segments.some((s) => s.includes(":"))) return { normalized: unified, problem: "PATH_TRAVERSAL" };
  return { normalized: segments.join("/") };
}

export function analyzeEntries(
  raw: Iterable<RawEntry>,
  limits: { maxEntries: number; maxUncompressedBytes: number },
): EntryAnalysis {
  const findings: Finding[] = [];
  const entries: StoredEntry[] = [];
  const topLevel = new Map<string, Set<string>>();
  let entryCount = 0;
  let uncompressedBytes = 0;

  for (const entry of raw) {
    entryCount += 1;
    if (entryCount > limits.maxEntries) {
      findings.push({ code: "TOO_MANY_ENTRIES" });
      break;
    }

    const { normalized, problem } = classifyPath(entry.path);
    if (problem) {
      findings.push({ code: problem, path: entry.path.slice(0, 300) });
      continue;
    }
    if (normalized.length === 0) continue;

    if (entry.isSymlink) findings.push({ code: "SYMLINK", path: normalized });
    if (entry.isEncrypted) findings.push({ code: "ENCRYPTED", path: normalized });

    if (!entry.isDirectory) {
      uncompressedBytes += Math.max(0, entry.size);
      const ext = fileExtension(normalized);
      if (BLOCKED_INNER_EXTENSIONS.has(ext)) findings.push({ code: "BLOCKED_EXTENSION", path: normalized });
      else if (INSPECTION_INNER_EXTENSIONS.has(ext)) findings.push({ code: "NATIVE_PLUGIN", path: normalized });
      else if (NESTED_ARCHIVE_EXTENSIONS.has(ext)) findings.push({ code: "NESTED_ARCHIVE", path: normalized });

      const compressed = entry.compressedSize ?? 0;
      if (compressed > 0 && entry.size > 100 * 1024 * 1024 && entry.size / compressed > 1000) {
        findings.push({ code: "SUSPICIOUS_RATIO", path: normalized });
      }
    }

    const segments = normalized.split("/");
    const head = segments[0] ?? "";
    const children = topLevel.get(head) ?? new Set<string>();
    if (segments.length > 1 && segments[1]) children.add(segments[1]);
    topLevel.set(head, children);

    if (entries.length < MAX_STORED_ENTRIES) {
      entries.push(entry.isDirectory ? { p: normalized, s: 0, d: 1 } : { p: normalized, s: entry.size });
    }
  }

  if (uncompressedBytes > limits.maxUncompressedBytes) findings.push({ code: "TOO_LARGE_UNCOMPRESSED" });

  const { omsiFolders, installPrefix } = detectOmsiLayout(topLevel);
  return {
    findings,
    entries,
    entryCount,
    uncompressedBytes,
    omsiFolders,
    installPrefix,
    truncated: entryCount > entries.length,
  };
}

function omsiNames(names: Iterable<string>): string[] {
  const found = new Set<string>();
  for (const name of names) {
    const canonical = OMSI_ROOT_FOLDERS.get(name.toLowerCase());
    if (canonical) found.add(canonical);
  }
  return [...found].sort();
}

/** Rozpozná, či archív obsahuje priečinky OMSI priamo, alebo zabalené v jednom obalovom priečinku. */
function detectOmsiLayout(topLevel: Map<string, Set<string>>): { omsiFolders: string[]; installPrefix: string | null } {
  const direct = omsiNames(topLevel.keys());
  if (direct.length > 0) return { omsiFolders: direct, installPrefix: "" };
  if (topLevel.size === 1) {
    const [wrapper, children] = [...topLevel.entries()][0] ?? ["", new Set<string>()];
    const nested = omsiNames(children);
    if (nested.length > 0) return { omsiFolders: nested, installPrefix: `${wrapper}/` };
  }
  return { omsiFolders: [], installPrefix: null };
}
