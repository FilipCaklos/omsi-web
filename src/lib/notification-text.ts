import type { Dictionary } from "@/i18n/dictionaries/sk";

export type NotificationKind = keyof Dictionary["notifications"]["types"];

/**
 * Text notifikácie z uložených parametrov (data). Ukladáme parametre, nie hotový text,
 * aby sa upozornenie zobrazilo v jazyku, ktorý má používateľ práve nastavený.
 */
export function notificationText(t: Dictionary, type: NotificationKind, data: unknown): string {
  const params = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const template = t.notifications.types[type] ?? t.notifications.types.SYSTEM;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = params[key];
    if (key === "status" && typeof value === "string" && value in t.bugs.status) {
      return t.bugs.status[value as keyof Dictionary["bugs"]["status"]];
    }
    if (key === "reason" && typeof value === "string" && value in t.admin.reports.reasons) {
      return t.admin.reports.reasons[value as keyof Dictionary["admin"]["reports"]["reasons"]];
    }
    return value === undefined || value === null ? "" : String(value);
  });
}
