import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const DOWNLOAD_TOKEN_TTL_SECONDS = 30 * 60;
/** Naviazanie prerušeného sťahovania (Range od stredu) funguje s tým istým odkazom ešte 24 hodín po expirácii. */
export const DOWNLOAD_RESUME_GRACE_SECONDS = 24 * 60 * 60;

export type TokenPayload = { fileId: string; expiresAt: number };

export type TokenCheck =
  | { ok: true; payload: TokenPayload }
  | { ok: false; reason: "MALFORMED" | "BAD_SIGNATURE" }
  /** Podpis je platný, iba vypršal čas – payload umožní naviazanie sťahovania v ochrannej lehote */
  | { ok: false; reason: "EXPIRED"; payload: TokenPayload };

function mac(secret: string, body: string, binding: string): string {
  return createHmac("sha256", secret).update(`${body}|${binding}`).digest("base64url");
}

/**
 * Token: „<fileId>.<exp>.<nonce>.<hmac>“. Väzba (hash IP klienta) sa do tokenu neukladá –
 * je iba súčasťou podpisu, takže skopírovaný odkaz z inej siete neprejde overením (anti-hotlink).
 */
export function signDownloadToken(secret: string, fileId: string, binding: string, now = Date.now()): string {
  if (!/^[a-z0-9]{10,40}$/.test(fileId)) throw new Error("Neplatné ID súboru");
  const expiresAt = Math.floor(now / 1000) + DOWNLOAD_TOKEN_TTL_SECONDS;
  const nonce = randomBytes(9).toString("base64url");
  const body = `${fileId}.${expiresAt}.${nonce}`;
  return `${body}.${mac(secret, body, binding)}`;
}

export function verifyDownloadToken(secret: string, token: string, binding: string, now = Date.now()): TokenCheck {
  const match = /^([a-z0-9]{10,40})\.(\d{10})\.([A-Za-z0-9_-]{12})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return { ok: false, reason: "MALFORMED" };
  const [, fileId = "", exp = "0", nonce = "", signature = ""] = match;
  const expected = Buffer.from(mac(secret, `${fileId}.${exp}.${nonce}`, binding));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: "BAD_SIGNATURE" };
  const expiresAt = Number(exp);
  if (expiresAt * 1000 < now) return { ok: false, reason: "EXPIRED", payload: { fileId, expiresAt } };
  return { ok: true, payload: { fileId, expiresAt } };
}
