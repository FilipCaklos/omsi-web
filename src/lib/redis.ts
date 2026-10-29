import "server-only";
import Redis from "ioredis";
import { env } from "@/lib/env";

const globalForRedis = globalThis as unknown as { redis?: Redis };

/** Zdieľané Redis spojenie (rate limiting, deduplikácia stiahnutí, cache). */
export function redis(): Redis {
  if (!globalForRedis.redis) {
    globalForRedis.redis = new Redis(env().REDIS_URL, {
      maxRetriesPerRequest: 2,
      // Príkazy počas (re)pripájania čakajú vo fronte, no nikdy dlhšie ako commandTimeout
      enableOfflineQueue: true,
      commandTimeout: 2_000,
      connectTimeout: 5_000,
    });
    // Pri výpadku ioredis hlási chybu pri každom pokuse o spojenie – logujeme najviac raz za 30 s
    let lastLogged = 0;
    globalForRedis.redis.on("error", (error: NodeJS.ErrnoException) => {
      const now = Date.now();
      if (now - lastLogged < 30_000) return;
      lastLogged = now;
      console.error("[redis] nedostupný:", error.code ?? error.name, error.message || "");
    });
    globalForRedis.redis.on("ready", () => {
      if (lastLogged > 0) console.info("[redis] spojenie obnovené");
      lastLogged = 0;
    });
  }
  return globalForRedis.redis;
}
