import { Readable } from "node:stream";
import { env } from "@/lib/env";
import { findDownloadableFile } from "@/server/downloads/access";
import { recordDownload } from "@/server/downloads/counter";
import { contentDisposition, parseRange } from "@/server/downloads/range";
import { DOWNLOAD_RESUME_GRACE_SECONDS, verifyDownloadToken } from "@/server/downloads/token";
import { runAfterResponse } from "@/server/http";
import { getClientIp, hashIp } from "@/server/security/ip";
import { getUserForHeaders } from "@/server/session";
import { storage } from "@/server/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE_HEADERS = {
  // no-transform: žiadna kompresia ani úprava – inak by nesedel Content-Length a rozsahy
  "Cache-Control": "private, no-store, no-transform",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox",
  "Referrer-Policy": "no-referrer",
} as const;

function plain(status: number, message: string): Response {
  return new Response(message, { status, headers: { ...BASE_HEADERS, "Content-Type": "text/plain; charset=utf-8" } });
}

type Params = { params: Promise<{ token: string }> };

/** Naväzujúca požiadavka správcu sťahovania: Range od nenulového bajtu (nie nové stiahnutie). */
function isResume(range: string | null): boolean {
  const match = range ? /^\s*bytes\s*=\s*(\d+)-\d*\s*$/i.exec(range) : null;
  return match !== null && Number(match[1]) > 0;
}

async function handle(request: Request, { params }: Params, method: "GET" | "HEAD"): Promise<Response> {
  const { token } = await params;
  const ipHash = hashIp(getClientIp(request.headers));
  const check = verifyDownloadToken(env().DOWNLOAD_TOKEN_SECRET, token, ipHash);
  let fileId: string;
  if (check.ok) {
    fileId = check.payload.fileId;
  } else if (check.reason === "EXPIRED" && isResume(request.headers.get("range")) && check.payload.expiresAt + DOWNLOAD_RESUME_GRACE_SECONDS >= Date.now() / 1000) {
    // Prerušené sťahovanie veľkej mapy sa dá dokončiť aj po vypršaní 30-minútového odkazu
    fileId = check.payload.fileId;
  } else if (check.reason === "EXPIRED") {
    return plain(410, "Platnosť odkazu vypršala. Vráť sa na stránku modu a klikni na Stiahnuť znova.");
  } else {
    return plain(403, "Odkaz na stiahnutie je neplatný alebo patrí inému pripojeniu.");
  }

  const viewer = await getUserForHeaders(request.headers);
  const file = await findDownloadableFile(fileId, viewer);
  if (!file) return plain(404, "Súbor už nie je dostupný.");

  const size = (await storage(file.storageDriver).size(file.storageKey)) ?? -1;
  if (size !== file.sizeBytes) {
    console.error("[download] nesúlad veľkosti/chýbajúci objekt", file.id, size, file.sizeBytes);
    return plain(503, "Súbor je dočasne nedostupný. Skús záložný mirror alebo to skús neskôr.");
  }

  const etag = `"${file.sha256}"`;
  const headers: Record<string, string> = {
    ...BASE_HEADERS,
    "Content-Type": "application/octet-stream",
    "Content-Disposition": contentDisposition(file.originalFilename),
    "Accept-Ranges": "bytes",
    ETag: etag,
    "Last-Modified": file.updatedAt.toUTCString(),
    "X-Checksum-SHA256": file.sha256,
  };

  // If-Range: ak sa súbor medzičasom zmenil, pošleme ho celý od začiatku
  const ifRange = request.headers.get("if-range");
  const rangeHeader = ifRange && ifRange !== etag ? null : request.headers.get("range");
  const range = parseRange(rangeHeader, size);

  if (range.type === "unsatisfiable") {
    return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
  }

  const start = range.type === "partial" ? range.start : 0;
  const end = range.type === "partial" ? range.end : size - 1;
  const length = end - start + 1;
  headers["Content-Length"] = String(length);
  if (range.type === "partial") headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
  const status = range.type === "partial" ? 206 : 200;

  if (method === "HEAD") return new Response(null, { status, headers });

  // Počíta sa iba začiatok sťahovania – naviazanie od stredu súboru nie je nové stiahnutie
  if (start === 0) {
    runAfterResponse(() => recordDownload({ fileId: file.id, modId: file.modId, userId: viewer?.id ?? null, ipHash }));
  }

  let stream: Readable;
  try {
    stream = await storage(file.storageDriver).read(file.storageKey, { start, end });
  } catch (error) {
    // Objekt zmizol medzi kontrolou veľkosti a otvorením (moderácia, upratovanie)
    console.error("[download] objekt sa nedá otvoriť", file.id, error);
    return plain(503, "Súbor je dočasne nedostupný. Skús záložný mirror alebo to skús neskôr.");
  }
  request.signal.addEventListener("abort", () => stream.destroy(), { once: true });
  return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, { status, headers });
}

/** GET /api/download/[token] – streamované sťahovanie s podporou HTTP 206 Partial Content. */
export async function GET(request: Request, context: Params): Promise<Response> {
  return handle(request, context, "GET");
}

export async function HEAD(request: Request, context: Params): Promise<Response> {
  return handle(request, context, "HEAD");
}
