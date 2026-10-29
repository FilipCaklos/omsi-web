import "server-only";
import { createWriteStream } from "node:fs";
import { openAsBlob } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import type { StorageDriver, VirusTotalStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { redis } from "@/lib/redis";
import { audit } from "@/server/audit";
import { notify } from "@/server/notifications";
import { storage, uploadTempDir } from "@/server/storage";
import { LocalDiskStorage } from "@/server/storage/local-disk";

/**
 * Antivírusová kontrola súborov modov cez VirusTotal (≈70 antivírusov).
 *  1. Najprv podľa SHA-256 – nič sa nenahráva, stačí jedna požiadavka.
 *  2. Neznámy súbor sa nahrá až keď je verzia aj mod verejne zverejnený: nahraté súbory sú
 *     dostupné bezpečnostnej komunite VirusTotalu, nezverejnené mody nesmú uniknúť.
 *  3. Pri 2+ detekciách sa súbor stiahne z verejného sťahovania a moderátori dostanú upozornenie.
 */

const API = "https://www.virustotal.com/api/v3";
/** Priamy upload do 32 MB, väčšie cez jednorazovú upload URL; VirusTotal prijme najviac 650 MB */
const DIRECT_UPLOAD_LIMIT = 32 * 1024 * 1024;
export const VT_MAX_FILE_BYTES = 650 * 1024 * 1024;
/** Od koľkých detekcií sa súbor považuje za škodlivý (1 detekcia býva pri OMSI .dll falošný poplach) */
const MALICIOUS_THRESHOLD = 2;

export type VtStats = { malicious: number; suspicious: number; undetected: number; harmless: number };

export class VirusTotalQuotaError extends Error {
  constructor() {
    super("VirusTotal: vyčerpaný limit požiadaviek");
    this.name = "VirusTotalQuotaError";
  }
}

export interface VirusTotalApi {
  /** Výsledok poslednej analýzy súboru, alebo null ak ho VirusTotal nepozná */
  lookup(sha256: string): Promise<VtStats | null>;
  /** Nahrá súbor, vráti ID analýzy. Spotrebuje 1 požiadavku (do 32 MB) alebo 2. */
  upload(file: { blob: Blob; name: string; size: number }): Promise<string>;
  /** Výsledok analýzy, alebo null ak ešte nie je hotová */
  analysis(id: string): Promise<VtStats | null>;
}

export function classifyStats(stats: VtStats): Exclude<VirusTotalStatus, "PENDING" | "NOT_SCANNED"> {
  if (stats.malicious >= MALICIOUS_THRESHOLD) return "MALICIOUS";
  if (stats.malicious > 0 || stats.suspicious > 0) return "SUSPICIOUS";
  return "CLEAN";
}

function readStats(value: unknown): VtStats {
  const s = (value ?? {}) as Record<string, unknown>;
  const n = (k: string) => (typeof s[k] === "number" ? (s[k] as number) : 0);
  return { malicious: n("malicious"), suspicious: n("suspicious"), undetected: n("undetected"), harmless: n("harmless") };
}

/** Skutočné API v3 (x-apikey). fetchImpl kvôli testom. */
export function virusTotalApi(apiKey: string, fetchImpl: typeof fetch = fetch): VirusTotalApi {
  async function call(url: string, init: RequestInit = {}): Promise<Response> {
    const response = await fetchImpl(url, {
      ...init,
      headers: { "x-apikey": apiKey, accept: "application/json", ...init.headers },
      signal: AbortSignal.timeout(10 * 60 * 1000),
    });
    if (response.status === 429) throw new VirusTotalQuotaError();
    return response;
  }
  async function json(response: Response): Promise<Record<string, unknown>> {
    if (!response.ok) throw new Error(`VirusTotal HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
    return (await response.json()) as Record<string, unknown>;
  }

  return {
    async lookup(sha256) {
      const response = await call(`${API}/files/${sha256}`);
      if (response.status === 404) return null;
      const body = await json(response);
      const attributes = ((body.data ?? {}) as { attributes?: Record<string, unknown> }).attributes ?? {};
      return readStats(attributes.last_analysis_stats);
    },
    async upload({ blob, name, size }) {
      let target = `${API}/files`;
      if (size > DIRECT_UPLOAD_LIMIT) {
        const body = await json(await call(`${API}/files/upload_url`));
        if (typeof body.data !== "string") throw new Error("VirusTotal: chýba upload_url");
        target = body.data;
      }
      const form = new FormData();
      form.append("file", blob, name);
      const body = await json(await call(target, { method: "POST", body: form }));
      const id = (body.data as { id?: unknown } | undefined)?.id;
      if (typeof id !== "string") throw new Error("VirusTotal: chýba ID analýzy");
      return id;
    },
    async analysis(id) {
      const body = await json(await call(`${API}/analyses/${encodeURIComponent(id)}`));
      const attributes = ((body.data ?? {}) as { attributes?: Record<string, unknown> }).attributes ?? {};
      return attributes.status === "completed" ? readStats(attributes.stats) : null;
    },
  };
}

/** Súbor z úložiska ako Blob: z lokálneho disku priamo (lenivé čítanie), z S3 cez dočasnú kópiu. */
async function withFileBlob<T>(file: { storageDriver: StorageDriver; storageKey: string }, task: (blob: Blob) => Promise<T>): Promise<T> {
  const provider = storage(file.storageDriver);
  if (provider instanceof LocalDiskStorage) return task(await openAsBlob(provider.resolve(file.storageKey)));
  const temp = path.join(await uploadTempDir(), `vt-${randomUUID()}.tmp`);
  try {
    await pipeline(await provider.read(file.storageKey), createWriteStream(temp));
    return await task(await openAsBlob(temp));
  } finally {
    await rm(temp, { force: true });
  }
}

/** Rozpočet požiadaviek: na jeden beh plánovača (limit za minútu) a denný limit v Redise. */
function requestBudget(perRun: number, dailyLimit: number, now: Date) {
  let used = 0;
  const dayKey = `vt:day:${now.toISOString().slice(0, 10)}`;
  return async (count = 1): Promise<boolean> => {
    if (used + count > perRun) return false;
    const total = await redis().incrby(dayKey, count);
    if (total === count) await redis().expire(dayKey, 2 * 24 * 60 * 60);
    if (total > dailyLimit) return false;
    used += count;
    return true;
  };
}

type Candidate = Awaited<ReturnType<typeof loadCandidates>>[number];

function loadCandidates(now: Date) {
  return db().modFile.findMany({
    where: {
      vtStatus: "PENDING",
      scanStatus: { not: "REJECTED" },
      OR: [
        { vtLastAttemptAt: null },
        // Rozbehnutá analýza – overiť o minútu; neznámy nezverejnený súbor – skúsiť o hodinu
        { vtAnalysisId: { not: null }, vtLastAttemptAt: { lt: new Date(now.getTime() - 60 * 1000) } },
        { vtLastAttemptAt: { lt: new Date(now.getTime() - 60 * 60 * 1000) } },
      ],
    },
    orderBy: [{ vtLastAttemptAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
    take: 20,
    select: {
      id: true,
      sha256: true,
      sizeBytes: true,
      storageDriver: true,
      storageKey: true,
      originalFilename: true,
      vtAnalysisId: true,
      version: { select: { status: true } },
      mod: { select: { id: true, slug: true, title: true, status: true } },
    },
  });
}

/** Zapíše výsledok všetkým súborom s rovnakým SHA-256 a pri detekciách upozorní moderátorov. */
async function applyResult(file: Candidate, stats: VtStats, now: Date): Promise<VirusTotalStatus> {
  const status = classifyStats(stats);
  const affected = await db().modFile.findMany({
    where: { sha256: file.sha256, vtStatus: "PENDING" },
    select: { id: true, scanStatus: true, mod: { select: { id: true, slug: true, title: true } } },
  });
  await db().modFile.updateMany({
    where: { id: { in: affected.map((f) => f.id) } },
    data: {
      vtStatus: status,
      vtMalicious: stats.malicious,
      vtSuspicious: stats.suspicious,
      vtEngines: stats.malicious + stats.suspicious + stats.undetected + stats.harmless,
      vtAnalysisId: null,
      vtCheckedAt: now,
      vtLastAttemptAt: now,
    },
  });
  if (status === "CLEAN") return status;

  if (status === "MALICIOUS") {
    // Okamžite z verejného sťahovania – moderátor rozhodne v administrácii (povoliť / zablokovať)
    await db().modFile.updateMany({ where: { id: { in: affected.filter((f) => f.scanStatus === "CLEAN").map((f) => f.id) } }, data: { scanStatus: "REQUIRES_MOD_INSPECTION" } });
  }
  const moderators = await db().user.findMany({ where: { role: { in: ["MODERATOR", "ADMIN"] }, bannedAt: null }, select: { id: true } });
  for (const flagged of affected) {
    await audit({ action: "file.flagged", targetType: "file", targetId: flagged.id, metadata: { sha256: file.sha256, ...stats, status } });
    await notify(
      moderators.map((m) => ({
        userId: m.id,
        type: "FILE_FLAGGED" as const,
        modId: flagged.mod.id,
        link: status === "MALICIOUS" ? "/admin/fronta" : `/mod/${flagged.mod.slug}#subory`,
        data: { modTitle: flagged.mod.title, detections: String(stats.malicious + stats.suspicious) },
      })),
    );
  }
  return status;
}

/**
 * Jeden beh plánovača: spracuje toľko súborov, koľko dovolí limit API.
 * Vracia počet súborov, ktorých stav sa posunul (pre log plánovača).
 */
export async function processVirusTotalQueue(options: { api: VirusTotalApi; perRun: number; dailyLimit: number; now?: Date }): Promise<number> {
  const now = options.now ?? new Date();
  const take = requestBudget(options.perRun, options.dailyLimit, now);
  const seen = new Set<string>();
  let progressed = 0;

  try {
    for (const file of await loadCandidates(now)) {
      if (seen.has(file.sha256)) continue;
      seen.add(file.sha256);

      if (file.vtAnalysisId) {
        if (!(await take())) break;
        const stats = await options.api.analysis(file.vtAnalysisId);
        if (stats) {
          await applyResult(file, stats, now);
          progressed += 1;
        } else {
          await db().modFile.update({ where: { id: file.id }, data: { vtLastAttemptAt: now } });
        }
        continue;
      }

      if (!(await take())) break;
      const known = await options.api.lookup(file.sha256);
      if (known) {
        await applyResult(file, known, now);
        progressed += 1;
        continue;
      }

      const isPublic = file.version.status === "PUBLISHED" && file.mod.status === "PUBLISHED";
      const size = Number(file.sizeBytes);
      if (size > VT_MAX_FILE_BYTES) {
        await db().modFile.updateMany({ where: { sha256: file.sha256, vtStatus: "PENDING" }, data: { vtStatus: "NOT_SCANNED", vtCheckedAt: now, vtLastAttemptAt: now } });
        progressed += 1;
        continue;
      }
      if (!isPublic || !(await take(size > DIRECT_UPLOAD_LIMIT ? 2 : 1))) {
        await db().modFile.update({ where: { id: file.id }, data: { vtLastAttemptAt: now } });
        continue;
      }
      const analysisId = await withFileBlob(file, (blob) => options.api.upload({ blob, name: file.originalFilename, size }));
      await db().modFile.update({ where: { id: file.id }, data: { vtAnalysisId: analysisId, vtLastAttemptAt: now } });
      progressed += 1;
    }
  } catch (error) {
    if (!(error instanceof VirusTotalQuotaError)) throw error;
    console.warn("[virustotal] limit API vyčerpaný, pokračujem neskôr");
  }
  return progressed;
}

/** Úloha plánovača – bez API kľúča nerobí nič. */
export async function runVirusTotal(): Promise<number> {
  const e = env();
  if (!e.VIRUSTOTAL_API_KEY) return 0;
  return processVirusTotalQueue({ api: virusTotalApi(e.VIRUSTOTAL_API_KEY), perRun: e.VIRUSTOTAL_REQUESTS_PER_MINUTE, dailyLimit: e.VIRUSTOTAL_DAILY_LIMIT });
}

export function virusTotalUrl(sha256: string): string {
  return `https://www.virustotal.com/gui/file/${sha256}`;
}
