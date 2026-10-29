import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { audit } from "@/server/audit";

const KEY = "system";
const CACHE_MS = 30_000;

const settingsSchema = z.object({
  uploadsEnabled: z.boolean(),
  registrationEnabled: z.boolean(),
  maxFileBytes: z.number().int().positive(),
  maxActiveUploads: z.number().int().min(1).max(20),
  /** Webhook Discord kanála pre oznámenia nových modov ("" = vypnuté) */
  discordWebhookUrl: z.string().max(300),
});

export type SystemSettings = z.infer<typeof settingsSchema>;

function defaults(): SystemSettings {
  return { uploadsEnabled: true, registrationEnabled: true, maxFileBytes: env().UPLOAD_MAX_FILE_BYTES, maxActiveUploads: 3, discordWebhookUrl: "" };
}

const globalForSettings = globalThis as unknown as { systemSettings?: { value: SystemSettings; at: number } };

/** Nastavenia z /admin/nastavenia (krátka cache v pamäti). Limit z .env je vždy horná hranica. */
export async function getSettings(): Promise<SystemSettings> {
  const cached = globalForSettings.systemSettings;
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  const row = await db().systemSetting.findUnique({ where: { key: KEY } });
  const parsed = settingsSchema.partial().safeParse(row?.value ?? {});
  const value = { ...defaults(), ...(parsed.success ? parsed.data : {}) };
  value.maxFileBytes = Math.min(value.maxFileBytes, env().UPLOAD_MAX_FILE_BYTES);
  globalForSettings.systemSettings = { value, at: Date.now() };
  return value;
}

export async function saveSettings(actorId: string, input: SystemSettings): Promise<void> {
  const value = settingsSchema.parse({ ...input, maxFileBytes: Math.min(input.maxFileBytes, env().UPLOAD_MAX_FILE_BYTES) });
  await db().systemSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value, updatedById: actorId },
    update: { value, updatedById: actorId },
  });
  globalForSettings.systemSettings = undefined;
  // Webhook je tajný (kto ho má, môže písať do kanála) – do audit logu iba či je nastavený
  const { discordWebhookUrl, ...logged } = value;
  await audit({ action: "settings.updated", actorId, targetType: "settings", targetId: KEY, metadata: { ...logged, discordWebhook: discordWebhookUrl !== "" } });
}
