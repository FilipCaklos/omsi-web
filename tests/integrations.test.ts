import { describe, expect, it } from "vitest";
import { DISCORD_WEBHOOK_PATTERN, buildAnnouncement, sendDiscordWebhook } from "@/server/integrations/discord";
import { buildRss, escapeXml } from "@/server/integrations/rss";

const BASE = "https://omsidepo.eu";
const MOD = {
  title: "Pezinok @everyone <Modra>",
  slug: "pezinok-modra",
  summary: "Prímestská mapa",
  categoryName: "Mapy",
  authorName: "Ľubo",
  version: "v1.0.2",
  imageId: "img123",
};

describe("Discord oznámenia", () => {
  it("embed s odkazom, verziou a náhľadom; nikoho neoznačí", () => {
    const payload = buildAnnouncement("NEW_VERSION", MOD, BASE) as { allowed_mentions: unknown; embeds: Record<string, unknown>[] };
    expect(payload.allowed_mentions).toEqual({ parse: [] });
    const embed = payload.embeds[0]!;
    expect(embed).toMatchObject({ title: "Nová verzia: Pezinok @everyone <Modra>", url: `${BASE}/mod/pezinok-modra`, image: { url: `${BASE}/api/media/img123?variant=full` } });
    expect(embed.fields).toContainEqual({ name: "Verzia", value: "v1.0.2", inline: true });
  });

  it("prijme iba skutočnú URL webhooku Discordu", () => {
    expect(DISCORD_WEBHOOK_PATTERN.test("https://discord.com/api/webhooks/123456789012345678/abcDEF_ghi-jklMNOpqrSTUvwx")).toBe(true);
    expect(DISCORD_WEBHOOK_PATTERN.test("https://evil.example/api/webhooks/1/abc")).toBe(false);
    expect(DISCORD_WEBHOOK_PATTERN.test("http://discord.com/api/webhooks/123456789012345678/abcDEF_ghi-jklMNOpqrSTUvwx")).toBe(false);
  });

  it("chyba Discordu sa neprenesie ďalej", async () => {
    const failing = (async () => {
      throw new Error("sieť");
    }) as typeof fetch;
    expect(await sendDiscordWebhook("https://discord.com/api/webhooks/1/x", {}, failing)).toBe(false);
    const ok = (async () => new Response(null, { status: 204 })) as typeof fetch;
    expect(await sendDiscordWebhook("https://discord.com/api/webhooks/1/x", {}, ok)).toBe(true);
  });
});

describe("RSS", () => {
  it("escapuje XML a obsahuje položky", () => {
    expect(escapeXml(`A & B <c> "d" 'e'\u0001`)).toBe("A &amp; B &lt;c&gt; &quot;d&quot; &apos;e&apos;");
    const xml = buildRss({ title: "OMSI Depo", url: `${BASE}/`, description: "Mody", feedUrl: `${BASE}/feed.xml` }, [
      { title: "Mapa <1>", url: `${BASE}/mod/a`, guid: "v1", description: "Popis & viac", category: "Mapy", author: "Ľubo", publishedAt: new Date("2026-10-29T10:00:00Z"), imageUrl: null },
    ]);
    expect(xml).toContain("<title>Mapa &lt;1&gt;</title>");
    expect(xml).toContain("<pubDate>Thu, 29 Oct 2026 10:00:00 GMT</pubDate>");
    expect(xml).toContain('<atom:link href="https://omsidepo.eu/feed.xml" rel="self" type="application/rss+xml" />');
  });
});
