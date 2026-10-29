import { Readable } from "node:stream";
import type { ModStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { getUserForHeaders } from "@/server/session";
import { storage } from "@/server/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLIC_STATUSES: ReadonlySet<ModStatus> = new Set(["PUBLISHED", "PLANNED", "SCHEDULED"]);

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain" } });
}

/** GET /api/media/[id]?variant=thumb|full – WebP náhľady modov a devlogov. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  if (!/^[a-z0-9]{10,40}$/.test(id)) return notFound();
  const variant = new URL(request.url).searchParams.get("variant") === "full" ? "full" : "thumb";

  const image = await db().mediaImage.findUnique({
    where: { id },
    select: {
      storageKey: true,
      fullKey: true,
      storageDriver: true,
      ownerId: true,
      kind: true,
      approvedAt: true,
      mod: { select: { status: true, authorId: true } },
      devlog: { select: { mod: { select: { status: true, authorId: true } } } },
    },
  });
  if (!image) return notFound();

  const parent = image.mod ?? image.devlog?.mod ?? null;
  const isPublic = parent !== null && PUBLIC_STATUSES.has(parent.status) && (image.kind !== "COMMUNITY" || image.approvedAt !== null);
  if (!isPublic) {
    // Koncept a nepriradené obrázky vidí iba vlastník a moderátor
    const user = await getUserForHeaders(request.headers);
    const allowed = user !== null && (user.id === image.ownerId || user.id === parent?.authorId || can(user.role, "moderation:queue"));
    if (!allowed) return notFound();
  }

  const key = variant === "full" ? image.fullKey : image.storageKey;
  const size = await storage(image.storageDriver).size(key);
  if (size === null) return notFound();

  const etag = `"${id}-${variant}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  const stream = await storage(image.storageDriver).read(key);
  return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(size),
      ETag: etag,
      // Kľúče obrázkov sú nemenné; neverejné obrázky sa nesmú cachovať v zdieľaných cache
      "Cache-Control": isPublic ? "public, max-age=31536000, immutable" : "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}
