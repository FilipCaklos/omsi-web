import "server-only";
import type Redis from "ioredis";
import { redis } from "@/lib/redis";

/** Atómové okno: INCR + nastavenie expirácie pri prvom zásahu + zostávajúci čas. */
const FIXED_WINDOW_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return { count, ttl }
`;

export type RateLimitPolicy = {
  /** Unikátny názov politiky – súčasť Redis kľúča */
  name: string;
  limit: number;
  windowSeconds: number;
  /** Pri výpadku Redisu: true = povoliť (dostupnosť), false = zamietnuť (bezpečnosť) */
  failOpen: boolean;
};

export const RATE_LIMITS = {
  signInIp: { name: "signin:ip", limit: 20, windowSeconds: 15 * 60, failOpen: false },
  signInAccount: { name: "signin:acct", limit: 8, windowSeconds: 15 * 60, failOpen: false },
  signUpIp: { name: "signup:ip", limit: 5, windowSeconds: 60 * 60, failOpen: false },
  passwordResetIp: { name: "pwreset:ip", limit: 10, windowSeconds: 60 * 60, failOpen: false },
  passwordResetAccount: { name: "pwreset:acct", limit: 3, windowSeconds: 60 * 60, failOpen: false },
  verifyEmailIp: { name: "verify:ip", limit: 10, windowSeconds: 60 * 60, failOpen: false },
  verifyEmailAccount: { name: "verify:acct", limit: 3, windowSeconds: 60 * 60, failOpen: false },
  changePassword: { name: "chpw:user", limit: 5, windowSeconds: 15 * 60, failOpen: false },
  socialSignInIp: { name: "social:ip", limit: 30, windowSeconds: 15 * 60, failOpen: false },
  profileUpdate: { name: "profile:user", limit: 20, windowSeconds: 10 * 60, failOpen: true },
  downloadTokenIp: { name: "dltoken:ip", limit: 60, windowSeconds: 10 * 60, failOpen: true },
  communityPost: { name: "post:user", limit: 10, windowSeconds: 10 * 60, failOpen: false },
  reportSubmit: { name: "report:user", limit: 10, windowSeconds: 60 * 60, failOpen: false },
  uploadInit: { name: "upload:user", limit: 30, windowSeconds: 60 * 60, failOpen: false },
} as const satisfies Record<string, RateLimitPolicy>;

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  /** Za koľko sekúnd sa okno uvoľní */
  retryAfterSeconds: number;
  /** Redis nebol dostupný – výsledok určila politika failOpen */
  unavailable?: boolean;
};

export async function consumeRateLimit(
  policy: RateLimitPolicy,
  identifier: string,
  client: Pick<Redis, "eval"> = redis(),
): Promise<RateLimitResult> {
  const key = `rl:${policy.name}:${identifier}`;
  const windowMs = policy.windowSeconds * 1000;
  try {
    const result = (await client.eval(FIXED_WINDOW_SCRIPT, 1, key, windowMs)) as [number, number];
    const count = Number(result[0]);
    const ttl = Math.max(0, Number(result[1]));
    return {
      allowed: count <= policy.limit,
      remaining: Math.max(0, policy.limit - count),
      retryAfterSeconds: Math.ceil(ttl / 1000),
    };
  } catch (error) {
    console.error(`[rate-limit] ${policy.name}:`, error instanceof Error ? error.message : error);
    return {
      allowed: policy.failOpen,
      remaining: 0,
      retryAfterSeconds: policy.failOpen ? 0 : 60,
      unavailable: true,
    };
  }
}

/** Skontroluje viac politík naraz (napr. IP + účet); zamietne pri prvom prekročení. */
export async function consumeAll(
  checks: ReadonlyArray<readonly [RateLimitPolicy, string]>,
  client?: Pick<Redis, "eval">,
): Promise<RateLimitResult> {
  let tightest: RateLimitResult = { allowed: true, remaining: Number.MAX_SAFE_INTEGER, retryAfterSeconds: 0 };
  for (const [policy, identifier] of checks) {
    const result = await consumeRateLimit(policy, identifier, client);
    if (!result.allowed) return result;
    if (result.remaining < tightest.remaining) tightest = result;
  }
  return tightest;
}
