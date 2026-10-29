import "server-only";
import { randomUUID } from "node:crypto";
import { redis } from "@/lib/redis";
import { sendNotificationDigests } from "@/server/mail/digest";
import { publishDueScheduled } from "@/server/mods/releases";
import { cleanupExpiredUploads } from "@/server/uploads/service";

export type Job = { name: string; intervalMs: number; run: () => Promise<unknown> };

/** Pravidelné úlohy aplikácie. */
export const JOBS: Job[] = [
  { name: "publish-scheduled", intervalMs: 60 * 1000, run: () => publishDueScheduled() },
  { name: "notification-emails", intervalMs: 5 * 60 * 1000, run: () => sendNotificationDigests() },
  { name: "cleanup-uploads", intervalMs: 15 * 60 * 1000, run: () => cleanupExpiredUploads() },
];

/**
 * Spustí úlohu iba na jednej inštancii naraz (Redis zámok). Ak Redis nie je dostupný,
 * úloha sa preskočí a skúsi sa v ďalšom intervale – upratovanie nie je časovo kritické.
 */
export async function runExclusive(job: Job): Promise<"ran" | "skipped"> {
  const key = `job:lock:${job.name}`;
  const token = randomUUID();
  try {
    const acquired = await redis().set(key, token, "PX", Math.max(30_000, job.intervalMs - 5_000), "NX");
    if (acquired !== "OK") return "skipped";
  } catch {
    return "skipped";
  }
  const started = Date.now();
  try {
    const result = await job.run();
    // Logujeme iba behy, ktoré niečo spravili (každominútový job by inak zahlcoval log)
    const didWork = typeof result === "number" ? result > 0 : result !== undefined && JSON.stringify(result) !== JSON.stringify({ emails: 0, skipped: 0 });
    if (didWork) console.info(`[jobs] ${job.name} hotové za ${Date.now() - started} ms`, result);
  } catch (error) {
    console.error(`[jobs] ${job.name} zlyhalo:`, error);
  }
  return "ran";
}

const globalForJobs = globalThis as unknown as { jobTimers?: NodeJS.Timeout[] };

export function startScheduler(): void {
  if (globalForJobs.jobTimers) return;
  globalForJobs.jobTimers = JOBS.map((job) => {
    // Prvé spustenie s malým oneskorením po štarte servera
    setTimeout(() => void runExclusive(job), Math.min(30_000, job.intervalMs / 2)).unref();
    const timer = setInterval(() => void runExclusive(job), job.intervalMs);
    timer.unref();
    return timer;
  });
}
