import "server-only";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/server/session";
import { canEditMod } from "./access";

export const WIZARD_STEPS = ["zaklad", "popis", "subory", "screenshoty", "doplnky", "odoslanie"] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export function isWizardStep(value: unknown): value is WizardStep {
  return typeof value === "string" && (WIZARD_STEPS as readonly string[]).includes(value);
}

/** Mod, ktorý smie používateľ upravovať v štúdiu (inak null – stránka vráti 404). */
export async function loadEditableMod(user: CurrentUser, modId: string) {
  if (!/^[a-z0-9]{10,40}$/.test(modId)) return null;
  const mod = await db().mod.findUnique({
    where: { id: modId },
    select: { id: true, slug: true, title: true, status: true, currentVersionId: true, author: { select: { id: true, role: true } } },
  });
  if (!mod || !canEditMod(user, mod)) return null;
  return mod;
}

/** Rozpracovaná verzia (koncept alebo vrátená na úpravy), do ktorej sa pridávajú súbory. */
export async function getWorkingVersion(modId: string) {
  return db().modVersion.findFirst({
    where: { modId, status: { in: ["DRAFT", "CHANGES_REQUESTED"] } },
    orderBy: { createdAt: "desc" },
    select: { id: true, version: true, changelog: true, status: true },
  });
}

/** Verzia čakajúca na schválenie – vtedy sa súbory nedajú meniť. */
export async function getPendingVersion(modId: string) {
  return db().modVersion.findFirst({
    where: { modId, status: "PENDING_REVIEW" },
    orderBy: { createdAt: "desc" },
    select: { id: true, version: true },
  });
}

export const VERSION_PATTERN = /^v?\d{1,4}(\.\d{1,4}){0,3}([-.+][0-9A-Za-z]{1,20})?$/;
