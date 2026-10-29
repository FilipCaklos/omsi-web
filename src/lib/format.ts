import { INTL_LOCALE, type AppLocale } from "@/i18n/config";

type PluralForms = { one: string; few: string; many: string; other: string };

/** Slovenské a české plurály: 1 súbor, 2–4 súbory, 5+ súborov. */
export function plural(locale: AppLocale, count: number, forms: PluralForms): string {
  const rule = new Intl.PluralRules(INTL_LOCALE[locale]).select(count);
  if (rule === "one" || rule === "few" || rule === "many") return forms[rule];
  return forms.other;
}

const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/** Veľkosť súboru v binárnych jednotkách (1 GB = 1024³ B), napr. „2,84 GB“. */
export function formatBytes(locale: AppLocale, bytes: number | bigint): string {
  let value = typeof bytes === "bigint" ? Number(bytes) : bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 ? 0 : value < 10 ? 2 : value < 100 ? 1 : 0;
  const number = new Intl.NumberFormat(INTL_LOCALE[locale], {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
  return `${number} ${UNITS[unit]}`;
}

export function formatNumber(locale: AppLocale, value: number): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale]).format(value);
}

export function formatDate(locale: AppLocale, date: Date): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    timeZone: "Europe/Bratislava",
  }).format(date);
}

export function formatDateTime(locale: AppLocale, date: Date): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Bratislava",
  }).format(date);
}

/** Prípona súboru vo forme „.7z“. */
export function formatExtension(extension: string): string {
  return extension.startsWith(".") ? extension.toLowerCase() : `.${extension.toLowerCase()}`;
}

/** Zostávajúci čas uploadu: „45 s“, „3 min 05 s“, „1 h 12 min“. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
  return `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")} min`;
}
