/** Časové pásmo komunity (SR aj ČR majú SEČ/SELČ). Dátumy vydaní zadáva autor v miestnom čase. */
export const COMMUNITY_TZ = "Europe/Bratislava";

/** Posun časového pásma oproti UTC v minútach pre daný okamih. */
function offsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/**
 * „2026-11-02T18:00“ (miestny čas z <input type="datetime-local">) → UTC okamih.
 * Správne aj pri prechode na letný/zimný čas. Neplatný vstup vráti null.
 */
export function localDateTimeToUtc(value: string, timeZone = COMMUNITY_TZ): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number) as [number, number, number, number, number, number];
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  if (Number.isNaN(naive)) return null;
  // Dve iterácie stačia aj pre okraj DST
  let guess = naive - offsetMinutes(new Date(naive), timeZone) * 60_000;
  guess = naive - offsetMinutes(new Date(guess), timeZone) * 60_000;
  const check = new Date(guess);
  return Number.isNaN(check.getTime()) ? null : check;
}

/** UTC okamih → hodnota pre <input type="datetime-local"> v miestnom čase. */
export function utcToLocalInput(instant: Date, timeZone = COMMUNITY_TZ): string {
  const local = new Date(instant.getTime() + offsetMinutes(instant, timeZone) * 60_000);
  return local.toISOString().slice(0, 16);
}
