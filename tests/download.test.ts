import { describe, expect, it } from "vitest";
import { contentDisposition, parseRange } from "@/server/downloads/range";
import { DOWNLOAD_TOKEN_TTL_SECONDS, signDownloadToken, verifyDownloadToken } from "@/server/downloads/token";

const SECRET = "download-secret-for-tests-0123456789abcdef";
const FILE = "cm9xk2a7b0000abcdefghijk";

describe("download token", () => {
  it("platný token pre rovnakú IP", () => {
    const token = signDownloadToken(SECRET, FILE, "ip-hash-a");
    expect(verifyDownloadToken(SECRET, token, "ip-hash-a")).toMatchObject({ ok: true, payload: { fileId: FILE } });
  });

  it("iná IP (hotlink z cudzieho webu) → BAD_SIGNATURE", () => {
    const token = signDownloadToken(SECRET, FILE, "ip-hash-a");
    expect(verifyDownloadToken(SECRET, token, "ip-hash-b")).toEqual({ ok: false, reason: "BAD_SIGNATURE" });
  });

  it("po 30 minútach → EXPIRED", () => {
    const now = Date.now();
    const token = signDownloadToken(SECRET, FILE, "ip", now);
    expect(verifyDownloadToken(SECRET, token, "ip", now + (DOWNLOAD_TOKEN_TTL_SECONDS - 5) * 1000).ok).toBe(true);
    expect(verifyDownloadToken(SECRET, token, "ip", now + (DOWNLOAD_TOKEN_TTL_SECONDS + 5) * 1000)).toEqual({ ok: false, reason: "EXPIRED" });
  });

  it("podvrhnuté ID súboru alebo predĺžená platnosť → BAD_SIGNATURE", () => {
    const token = signDownloadToken(SECRET, FILE, "ip");
    const [, exp, nonce, sig] = token.split(".");
    expect(verifyDownloadToken(SECRET, `cm9xk2a7b0000zzzzzzzzzzz.${exp}.${nonce}.${sig}`, "ip").ok).toBe(false);
    expect(verifyDownloadToken(SECRET, `${FILE}.${Number(exp) + 9999}.${nonce}.${sig}`, "ip").ok).toBe(false);
    expect(verifyDownloadToken("iny-secret-0123456789abcdef0123456789abc", token, "ip").ok).toBe(false);
    expect(verifyDownloadToken(SECRET, "../../etc/passwd", "ip")).toEqual({ ok: false, reason: "MALFORMED" });
  });
});

describe("HTTP Range", () => {
  const size = 1000;
  it.each([
    [null, { type: "full" }],
    ["bytes=0-99", { type: "partial", start: 0, end: 99 }],
    ["bytes=500-", { type: "partial", start: 500, end: 999 }],
    ["bytes=-100", { type: "partial", start: 900, end: 999 }],
    ["bytes=900-5000", { type: "partial", start: 900, end: 999 }],
    ["bytes=1000-", { type: "unsatisfiable" }],
    ["bytes=-0", { type: "unsatisfiable" }],
    ["bytes=0-10,20-30", { type: "full" }],
    ["bytes=50-10", { type: "full" }],
    ["items=0-10", { type: "full" }],
  ])("%s", (header, expected) => {
    expect(parseRange(header, size)).toEqual(expected);
  });

  it("Content-Disposition s diakritikou", () => {
    expect(contentDisposition("Štrbské Pleso v1.0.2.7z")).toBe(
      `attachment; filename="Strbske Pleso v1.0.2.7z"; filename*=UTF-8''%C5%A0trbsk%C3%A9%20Pleso%20v1.0.2.7z`,
    );
    expect(contentDisposition('a"b\\c.zip')).toContain('filename="a_b_c.zip"');
  });
});
