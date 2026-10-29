import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getSettings } from "@/server/settings";

/** Webhook kanála na Discord serveri (Upraviť kanál → Integrácie → Webhooky → Kopírovať URL). */
export const DISCORD_WEBHOOK_PATTERN = /^https:\/\/(?:ptb\.|canary\.)?(?:discord|discordapp)\.com\/api\/webhooks\/\d{5,30}\/[\w-]{20,120}$/;

export type AnnouncementKind = "RELEASED" | "NEW_VERSION" | "PLANNED";

export type AnnouncedMod = {
  title: string;
  slug: string;
  summary: string;
  categoryName: string;
  authorName: string;
  version: string | null;
  imageId: string | null;
};

const HEADINGS: Record<AnnouncementKind, string> = {
  RELEASED: "Nová modifikácia",
  NEW_VERSION: "Nová verzia",
  PLANNED: "Ohlásený projekt",
};
const COLORS: Record<AnnouncementKind, number> = { RELEASED: 0xf59e0b, NEW_VERSION: 0x22c55e, PLANNED: 0x3b82f6 };

/**
 * Správa pre Discord webhook (embed s náhľadom). allowed_mentions: názov modu od autora
 * nesmie spustiť @everyone ani označiť roly.
 */
export function buildAnnouncement(kind: AnnouncementKind, mod: AnnouncedMod, base: string): Record<string, unknown> {
  const url = `${base}/mod/${mod.slug}`;
  const fields = [
    { name: "Kategória", value: mod.categoryName, inline: true },
    { name: "Autor", value: mod.authorName, inline: true },
    ...(mod.version ? [{ name: "Verzia", value: `v${mod.version.replace(/^v/i, "")}`, inline: true }] : []),
  ];
  return {
    username: "OMSI Depo",
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: `${HEADINGS[kind]}: ${mod.title}`.slice(0, 256),
        url,
        description: mod.summary.slice(0, 400),
        color: COLORS[kind],
        fields,
        ...(mod.imageId ? { image: { url: `${base}/api/media/${mod.imageId}?variant=full` } } : {}),
        footer: { text: new URL(base).hostname },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

export async function sendDiscordWebhook(webhookUrl: string, payload: Record<string, unknown>, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await fetchImpl(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) console.error("[discord] webhook HTTP", response.status, (await response.text()).slice(0, 200));
    return response.ok;
  } catch (error) {
    console.error("[discord] webhook zlyhal:", error instanceof Error ? error.message : error);
    return false;
  }
}

/** Oznámi mod do Discord kanála, ak je webhook nastavený. Chyba Discordu nikdy nezastaví zverejnenie. */
export async function announceMod(modId: string, kind: AnnouncementKind): Promise<void> {
  const { discordWebhookUrl } = await getSettings();
  if (!discordWebhookUrl) return;
  const mod = await db().mod.findUnique({
    where: { id: modId },
    select: {
      title: true,
      slug: true,
      summary: true,
      status: true,
      category: { select: { nameSk: true } },
      author: { select: { name: true } },
      currentVersion: { select: { version: true } },
      images: { where: { kind: "SCREENSHOT" }, orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], take: 1, select: { id: true } },
    },
  });
  // Skrytý mod sa neoznamuje (napr. nová verzia skrytého modu)
  if (!mod || !["PUBLISHED", "PLANNED", "SCHEDULED"].includes(mod.status)) return;
  await sendDiscordWebhook(
    discordWebhookUrl,
    buildAnnouncement(
      kind,
      {
        title: mod.title,
        slug: mod.slug,
        summary: mod.summary,
        categoryName: mod.category.nameSk,
        authorName: mod.author.name,
        version: kind === "PLANNED" ? null : (mod.currentVersion?.version ?? null),
        imageId: mod.images[0]?.id ?? null,
      },
      env().APP_URL,
    ),
  );
}
