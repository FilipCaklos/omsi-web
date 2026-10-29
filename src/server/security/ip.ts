import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { env } from "@/lib/env";

const UNKNOWN_IP = "0.0.0.0";

/**
 * IP klienta z hlavičky reverznej proxy. Pri reťazci X-Forwarded-For sa berie POSLEDNÁ hodnota,
 * ktorú pridala naša proxy – hodnoty vľavo môže podvrhnúť klient.
 */
export function getClientIp(headers: Headers, headerName: string = env().CLIENT_IP_HEADER): string {
  const raw = headers.get(headerName);
  if (!raw) return UNKNOWN_IP;
  const candidate = raw.split(",").map((part) => part.trim()).filter(Boolean).at(-1) ?? "";
  // IPv4 s portom („1.2.3.4:5678“) a IPv6 v hranatých zátvorkách
  const cleaned = candidate.replace(/^\[(.+)\](?::\d+)?$/, "$1").replace(/^(\d+\.\d+\.\d+\.\d+):\d+$/, "$1");
  return isIP(cleaned) ? cleaned : UNKNOWN_IP;
}

/** IPv6 sa zjednotí na /64 prefix, aby si útočník nemohol rotovať adresy v rámci jednej siete. */
export function normalizeIpForLimits(ip: string): string {
  if (isIP(ip) !== 6) return ip;
  const expanded = expandIpv6(ip);
  return `${expanded.split(":").slice(0, 4).join(":")}::/64`;
}

function expandIpv6(ip: string): string {
  const [head = "", tail = ""] = ip.split("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];
  const missing = 8 - headParts.length - tailParts.length;
  const parts = ip.includes("::") ? [...headParts, ...Array(Math.max(0, missing)).fill("0"), ...tailParts] : headParts;
  return parts.map((p) => p.padStart(4, "0").toLowerCase()).join(":");
}

/** HMAC-SHA256 – surovú IP adresu nikdy neukladáme do DB ani do Redisu. */
export function hashIp(ip: string): string {
  return createHmac("sha256", env().IP_HASH_SECRET).update(normalizeIpForLimits(ip)).digest("hex");
}

/** Hash ľubovoľného identifikátora (napr. email pri rate limite a audit logu). */
export function hashIdentifier(value: string): string {
  return createHmac("sha256", env().IP_HASH_SECRET).update(`id:${value.trim().toLowerCase()}`).digest("hex");
}
