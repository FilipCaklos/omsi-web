import RedisMock from "ioredis-mock";
import { describe, expect, it, vi } from "vitest";
import { getClientIp, hashIp, normalizeIpForLimits } from "@/server/security/ip";
import { consumeAll, consumeRateLimit, type RateLimitPolicy } from "@/server/security/rate-limit";
import { TURNSTILE_FIELD, verifyTurnstile } from "@/server/security/turnstile";

const policy: RateLimitPolicy = { name: "test", limit: 3, windowSeconds: 60, failOpen: false };

describe("rate limiter (Redis fixed window)", () => {
  it("povolí presne `limit` požiadaviek a potom zamietne", async () => {
    const redis = new RedisMock();
    const results = [];
    for (let i = 0; i < 4; i += 1) results.push(await consumeRateLimit(policy, "ip-a", redis));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[2]?.remaining).toBe(0);
    expect(results[3]?.retryAfterSeconds).toBeGreaterThan(0);
    expect(results[3]?.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("počíta identifikátory oddelene", async () => {
    const redis = new RedisMock();
    for (let i = 0; i < 3; i += 1) await consumeRateLimit(policy, "ip-b", redis);
    expect((await consumeRateLimit(policy, "ip-c", redis)).allowed).toBe(true);
  });

  it("pri výpadku Redisu rešpektuje failOpen", async () => {
    const broken = { eval: async () => Promise.reject(new Error("ECONNREFUSED")) };
    expect(await consumeRateLimit(policy, "x", broken)).toMatchObject({ allowed: false, unavailable: true });
    expect((await consumeRateLimit({ ...policy, failOpen: true }, "x", broken)).allowed).toBe(true);
  });

  it("consumeAll zamietne pri prvej prekročenej politike", async () => {
    const redis = new RedisMock();
    const strict: RateLimitPolicy = { name: "strict", limit: 1, windowSeconds: 60, failOpen: false };
    await consumeAll([[policy, "a"], [strict, "b"]], redis);
    const second = await consumeAll([[policy, "a"], [strict, "b"]], redis);
    expect(second.allowed).toBe(false);
  });
});

describe("IP adresa klienta", () => {
  it("berie poslednú hodnotu X-Forwarded-For (pridanú našou proxy)", () => {
    const headers = new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" });
    expect(getClientIp(headers)).toBe("203.0.113.7");
  });

  it("odmietne nezmyselnú hodnotu a odstráni port", () => {
    expect(getClientIp(new Headers({ "x-forwarded-for": "<script>" }))).toBe("0.0.0.0");
    expect(getClientIp(new Headers({ "x-forwarded-for": "198.51.100.4:51234" }))).toBe("198.51.100.4");
    expect(getClientIp(new Headers())).toBe("0.0.0.0");
  });

  it("IPv6 zjednotí na /64 a hash je stabilný, no nie surová IP", () => {
    expect(normalizeIpForLimits("2001:db8:1:2:aaaa::1")).toBe("2001:0db8:0001:0002::/64");
    expect(hashIp("2001:db8:1:2::5")).toBe(hashIp("2001:db8:1:2:ffff::9"));
    expect(hashIp("203.0.113.7")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashIp("203.0.113.7")).not.toContain("203");
  });
});

describe("Cloudflare Turnstile", () => {
  it("chýbajúci token zamietne bez volania Cloudflare", async () => {
    const fetchMock = vi.fn();
    expect(await verifyTurnstile(null, "1.2.3.4", fetchMock)).toEqual({ ok: false, reason: "missing" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("pošle secret, token aj IP a prijme úspech", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = init?.body as URLSearchParams;
      expect(body.get("secret")).toBe(process.env.TURNSTILE_SECRET_KEY);
      expect(body.get("response")).toBe("token-123");
      expect(body.get("remoteip")).toBe("1.2.3.4");
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    expect(await verifyTurnstile("token-123", "1.2.3.4", fetchMock as typeof fetch)).toEqual({ ok: true });
  });

  it("neplatný token → invalid, výpadok → unavailable", async () => {
    const invalid = vi.fn(async () => new Response(JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] })));
    expect(await verifyTurnstile("bad", "1.2.3.4", invalid as typeof fetch)).toEqual({ ok: false, reason: "invalid" });
    const down = vi.fn(async () => Promise.reject(new Error("network")));
    expect(await verifyTurnstile("tok", "1.2.3.4", down as typeof fetch)).toEqual({ ok: false, reason: "unavailable" });
    expect(down).toHaveBeenCalledTimes(2);
  });

  it("názov poľa zodpovedá widgetu Cloudflare", () => {
    expect(TURNSTILE_FIELD).toBe("cf-turnstile-response");
  });
});
