import "server-only";
import { db } from "@/lib/db";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Lehoty uchovávania – musia sedieť s textom v src/i18n/legal.ts (Ochrana osobných údajov). */
export const RETENTION = {
  downloadEventsDays: 90,
  auditLogDays: 365,
} as const;

/**
 * Zmaže osobné údaje po uplynutí lehoty: expirované relácie (IP adresa a user agent prihlásenia),
 * staré záznamy o stiahnutiach (odtlačok IP) a bezpečnostný záznam starší ako rok.
 */
export async function purgeExpiredPersonalData(now = new Date()): Promise<{ sessions: number; downloadEvents: number; auditLogs: number }> {
  const [sessions, downloadEvents, auditLogs] = await Promise.all([
    db().session.deleteMany({ where: { expiresAt: { lt: now } } }),
    db().downloadEvent.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - RETENTION.downloadEventsDays * DAY_MS) } } }),
    db().auditLog.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - RETENTION.auditLogDays * DAY_MS) } } }),
  ]);
  return { sessions: sessions.count, downloadEvents: downloadEvents.count, auditLogs: auditLogs.count };
}
