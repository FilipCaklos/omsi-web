/**
 * Klientsky chunked upload (prehliadač aj Node). Posiela súbor po častiach na /api/uploads,
 * po výpadku spojenia pokračuje od posledného prijatého chunku a hlási priebeh, rýchlosť a ETA.
 */

export type UploadStatus = {
  id: string;
  filename: string;
  sizeBytes: number;
  chunkSize: number;
  totalChunks: number;
  receivedChunks: number;
  receivedBytes: number;
  status: "UPLOADING" | "ASSEMBLING" | "SCANNING" | "COMPLETED" | "FAILED" | "EXPIRED";
  errorCode: string | null;
  sha256: string | null;
  scanStatus: "PENDING" | "CLEAN" | "REQUIRES_MOD_INSPECTION" | "REJECTED" | null;
  findings: { code: string; path?: string }[];
  archiveFormat: string | null;
  archiveEntryCount: number | null;
  omsiFolders: string[];
  expiresAt: string;
};

export type UploadPhase = "preparing" | "uploading" | "scanning" | "done" | "failed";

export type UploadProgress = {
  phase: UploadPhase;
  uploadedBytes: number;
  totalBytes: number;
  /** Kĺzavý priemer rýchlosti v B/s */
  bytesPerSecond: number;
  /** Odhad zostávajúceho času v sekundách (null kým nie je dosť dát) */
  etaSeconds: number | null;
};

export class UploadError extends Error {
  constructor(
    public readonly code: string,
    public readonly status?: UploadStatus,
  ) {
    super(code);
    this.name = "UploadError";
  }
}

type UploadSource = Blob & { name: string; lastModified?: number };

type KeyValueStore = { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void };

export type ChunkedUploadOptions = {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  modId?: string;
  onProgress?: (progress: UploadProgress) => void;
  /** Úložisko na zapamätanie rozpracovaného uploadu (localStorage v prehliadači) */
  resumeStore?: KeyValueStore | null;
  maxRetries?: number;
  pollIntervalMs?: number;
};

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new UploadError("ABORTED"));
      },
      { once: true },
    );
  });

function resumeKey(file: UploadSource): string {
  return `omsi-upload:${file.name}:${file.size}:${file.lastModified ?? 0}`;
}

function defaultStore(): KeyValueStore | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export async function uploadInChunks(file: UploadSource, options: ChunkedUploadOptions = {}): Promise<UploadStatus> {
  const base = options.baseUrl ?? "";
  const doFetch = options.fetchImpl ?? fetch;
  const store = options.resumeStore === undefined ? defaultStore() : options.resumeStore;
  const maxRetries = options.maxRetries ?? 5;
  const pollMs = options.pollIntervalMs ?? 1500;
  const key = resumeKey(file);

  let speed = 0;
  let uploadedBytes = 0;
  const report = (phase: UploadPhase) => {
    const remaining = file.size - uploadedBytes;
    options.onProgress?.({
      phase,
      uploadedBytes,
      totalBytes: file.size,
      bytesPerSecond: speed,
      etaSeconds: speed > 0 && phase === "uploading" ? Math.ceil(remaining / speed) : null,
    });
  };

  async function api(path: string, init: RequestInit): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
    const response = await doFetch(`${base}${path}`, { credentials: "same-origin", ...init, signal: options.signal });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: response.ok, status: response.status, body };
  }

  report("preparing");

  // 1) Naviazanie na rozpracovaný upload alebo založenie nového
  let status: UploadStatus | null = null;
  const savedId = store?.getItem(key);
  if (savedId) {
    const existing = await api(`/api/uploads/${encodeURIComponent(savedId)}`, { method: "GET" });
    if (existing.ok && existing.body.status === "UPLOADING" && existing.body.sizeBytes === file.size) {
      status = existing.body as unknown as UploadStatus;
    } else {
      store?.removeItem(key);
    }
  }
  if (!status) {
    const created = await api("/api/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name, sizeBytes: file.size, modId: options.modId }),
    });
    if (!created.ok) throw new UploadError(String(created.body.error ?? `HTTP_${created.status}`));
    status = created.body as unknown as UploadStatus;
    store?.setItem(key, status.id);
  }

  // 2) Chunky – sekvenčne, s opakovaním pri sieťovej chybe
  let index = status.receivedChunks;
  uploadedBytes = status.receivedBytes;
  report("uploading");

  while (index < status.totalChunks) {
    const start = index * status.chunkSize;
    const chunk = file.slice(start, Math.min(file.size, start + status.chunkSize));
    let attempt = 0;
    for (;;) {
      const started = Date.now();
      try {
        const result = await api(`/api/uploads/${status.id}/chunks/${index}`, {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream" },
          body: chunk,
        });
        if (result.ok) {
          const seconds = Math.max(0.001, (Date.now() - started) / 1000);
          const instant = chunk.size / seconds;
          speed = speed === 0 ? instant : speed * 0.7 + instant * 0.3;
          status = result.body as unknown as UploadStatus;
          index = status.receivedChunks;
          uploadedBytes = status.receivedBytes;
          report("uploading");
          break;
        }
        if (result.status === 409 && result.body.error === "CHUNK_OUT_OF_ORDER" && typeof result.body.expected === "number") {
          index = result.body.expected;
          uploadedBytes = Math.min(file.size, index * status.chunkSize);
          break;
        }
        // Chyby, ktoré opakovanie nevyrieši
        if (result.status < 500 && result.status !== 409 && result.status !== 429) {
          throw new UploadError(String(result.body.error ?? `HTTP_${result.status}`));
        }
      } catch (error) {
        if (error instanceof UploadError) throw error;
        if (options.signal?.aborted) throw new UploadError("ABORTED");
      }
      attempt += 1;
      if (attempt > maxRetries) throw new UploadError("NETWORK_ERROR");
      await sleep(Math.min(30_000, 1000 * 2 ** (attempt - 1)), options.signal);
    }
  }

  // 3) Dokončenie a čakanie na kontrolu (SHA-256, obsah archívu)
  const completed = await api(`/api/uploads/${status.id}/complete`, { method: "POST" });
  if (!completed.ok) throw new UploadError(String(completed.body.error ?? `HTTP_${completed.status}`));
  status = completed.body as unknown as UploadStatus;
  report("scanning");

  while (status.status === "SCANNING" || status.status === "ASSEMBLING") {
    await sleep(pollMs, options.signal);
    const polled = await api(`/api/uploads/${status.id}`, { method: "GET" });
    if (!polled.ok) throw new UploadError(String(polled.body.error ?? `HTTP_${polled.status}`));
    status = polled.body as unknown as UploadStatus;
  }

  store?.removeItem(key);
  if (status.status !== "COMPLETED") {
    report("failed");
    throw new UploadError(status.errorCode ?? "UPLOAD_FAILED", status);
  }
  report("done");
  return status;
}
