import { access, constants, mkdir } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CheckResult = { ok: boolean; latencyMs: number; error?: string };

async function timed(check: () => Promise<void>): Promise<CheckResult> {
  const started = performance.now();
  try {
    await check();
    return { ok: true, latencyMs: Math.round(performance.now() - started) };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : "unknown",
    };
  }
}

export async function GET(): Promise<NextResponse> {
  const [database, extensions, cache, storage] = await Promise.all([
    timed(async () => {
      await db().$queryRaw`SELECT 1`;
    }),
    timed(async () => {
      const rows = await db().$queryRaw<{ extname: string }[]>`
        SELECT extname FROM pg_extension WHERE extname IN ('unaccent', 'pg_trgm')`;
      if (rows.length !== 2) throw new Error("Chýba rozšírenie unaccent alebo pg_trgm");
    }),
    timed(async () => {
      const pong = await redis().ping();
      if (pong !== "PONG") throw new Error(`Neočakávaná odpoveď: ${pong}`);
    }),
    timed(async () => {
      if (env().STORAGE_DRIVER !== "LOCAL_DISK") return;
      const root = path.resolve(env().STORAGE_LOCAL_ROOT);
      await mkdir(root, { recursive: true });
      await access(root, constants.R_OK | constants.W_OK);
    }),
  ]);

  const checks = { database, extensions, redis: cache, storage };
  const healthy = Object.values(checks).every((check) => check.ok);

  return NextResponse.json(
    { status: healthy ? "ok" : "degraded", time: new Date().toISOString(), checks },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
