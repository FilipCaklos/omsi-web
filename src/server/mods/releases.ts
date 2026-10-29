import "server-only";
import { db } from "@/lib/db";
import { publishVersion } from "./publish";

/**
 * Zverejní naplánované vydania, ktorých čas nastal. Volá ho plánovač každú minútu
 * a navyše detail modu pri zobrazení (odomknutie presne v sekunde vydania aj bez čakania na job).
 * Súbežné volania sú bezpečné – mod si „nárokuje“ podmienená aktualizácia stavu.
 */
export async function publishDueScheduled(now = new Date(), onlyModId?: string): Promise<number> {
  const due = await db().mod.findMany({
    where: {
      status: "SCHEDULED",
      ...(onlyModId ? { id: onlyModId } : {}),
      plannedRelease: { autoPublish: true, releaseAt: { lte: now } },
    },
    select: { id: true, authorId: true },
    take: 50,
  });

  let published = 0;
  for (const mod of due) {
    const version = await db().modVersion.findFirst({
      where: { modId: mod.id, status: "SCHEDULED" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!version) {
      // Naplánovaná verzia zmizla (napr. vrátená na úpravy) – projekt zostáva ohlásený
      await db().mod.updateMany({ where: { id: mod.id, status: "SCHEDULED" }, data: { status: "PLANNED" } });
      continue;
    }
    const claimed = await db().mod.updateMany({ where: { id: mod.id, status: "SCHEDULED" }, data: { status: "PUBLISHED" } });
    if (claimed.count !== 1) continue;
    await publishVersion(version.id, mod.authorId);
    published += 1;
  }
  return published;
}

export type PlannedIssue = "SUMMARY_LENGTH" | "NO_SCREENSHOT" | "NOT_PLANNED";

/** Na ohlásenie pripravovaného vydania stačí plán, krátky popis a aspoň jeden screenshot. */
export async function checkPlannedReadiness(modId: string): Promise<PlannedIssue[]> {
  const mod = await db().mod.findUnique({
    where: { id: modId },
    select: {
      summary: true,
      plannedRelease: { select: { id: true } },
      _count: { select: { images: { where: { kind: "SCREENSHOT" } } } },
    },
  });
  if (!mod) return ["NOT_PLANNED"];
  const issues: PlannedIssue[] = [];
  if (!mod.plannedRelease) issues.push("NOT_PLANNED");
  if (mod.summary.trim().length < 20) issues.push("SUMMARY_LENGTH");
  if (mod._count.images === 0) issues.push("NO_SCREENSHOT");
  return issues;
}
