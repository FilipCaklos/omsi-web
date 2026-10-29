import { describe, expect, it } from "vitest";
import { VirusTotalQuotaError, classifyStats, virusTotalApi } from "@/server/security/virustotal";

const SHA = "a".repeat(64);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("VirusTotal – vyhodnotenie", () => {
  it("1 detekcia je podozrivá (falošné poplachy pri .dll), 2+ škodlivé", () => {
    expect(classifyStats({ malicious: 0, suspicious: 0, undetected: 70, harmless: 0 })).toBe("CLEAN");
    expect(classifyStats({ malicious: 1, suspicious: 0, undetected: 69, harmless: 0 })).toBe("SUSPICIOUS");
    expect(classifyStats({ malicious: 0, suspicious: 2, undetected: 68, harmless: 0 })).toBe("SUSPICIOUS");
    expect(classifyStats({ malicious: 2, suspicious: 0, undetected: 68, harmless: 0 })).toBe("MALICIOUS");
  });
});

describe("VirusTotal – API v3", () => {
  it("lookup: 404 = neznámy súbor, 200 = posledná analýza, posiela x-apikey", async () => {
    const seen: { url: string; key: string | null }[] = [];
    const api = virusTotalApi("tajny-kluc", (async (url: string, init?: RequestInit) => {
      seen.push({ url, key: new Headers(init?.headers).get("x-apikey") });
      return url.endsWith("b".repeat(64))
        ? json({ error: { code: "NotFoundError" } }, 404)
        : json({ data: { attributes: { last_analysis_stats: { malicious: 1, suspicious: 0, undetected: 65, harmless: 4, timeout: 0 } } } });
    }) as typeof fetch);
    expect(await api.lookup(SHA)).toEqual({ malicious: 1, suspicious: 0, undetected: 65, harmless: 4 });
    expect(await api.lookup("b".repeat(64))).toBeNull();
    expect(seen[0]).toEqual({ url: `https://www.virustotal.com/api/v3/files/${SHA}`, key: "tajny-kluc" });
  });

  it("upload: do 32 MB priamo, väčší cez upload_url", async () => {
    const posts: string[] = [];
    const api = virusTotalApi("k", (async (url: string, init?: RequestInit) => {
      if (url.endsWith("/files/upload_url")) return json({ data: "https://upload.virustotal.com/xyz" });
      posts.push(url);
      expect(init?.body).toBeInstanceOf(FormData);
      return json({ data: { type: "analysis", id: `an-${posts.length}` } });
    }) as typeof fetch);
    expect(await api.upload({ blob: new Blob(["x"]), name: "maly.zip", size: 1 })).toBe("an-1");
    expect(await api.upload({ blob: new Blob(["x"]), name: "velky.zip", size: 100 * 1024 * 1024 })).toBe("an-2");
    expect(posts).toEqual(["https://www.virustotal.com/api/v3/files", "https://upload.virustotal.com/xyz"]);
  });

  it("analýza: kým nie je hotová, vráti null; 429 = vyčerpaný limit", async () => {
    let status = "queued";
    const api = virusTotalApi("k", (async (url: string) => {
      if (url.includes("limit")) return json({}, 429);
      return json({ data: { attributes: { status, stats: { malicious: 3, suspicious: 0, undetected: 60, harmless: 0 } } } });
    }) as typeof fetch);
    expect(await api.analysis("an-1")).toBeNull();
    status = "completed";
    expect(await api.analysis("an-1")).toEqual({ malicious: 3, suspicious: 0, undetected: 60, harmless: 0 });
    await expect(api.analysis("limit")).rejects.toBeInstanceOf(VirusTotalQuotaError);
  });
});
