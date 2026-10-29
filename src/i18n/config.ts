export const LOCALES = ["sk", "cs"] as const;
export type AppLocale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = "sk";
export const LOCALE_COOKIE = "locale";

export const THEMES = ["dark", "light"] as const;
export type Theme = (typeof THEMES)[number];
export const DEFAULT_THEME: Theme = "dark";
export const THEME_COOKIE = "theme";

/** BCP 47 značky pre Intl formátovanie. */
export const INTL_LOCALE: Record<AppLocale, string> = { sk: "sk-SK", cs: "cs-CZ" };

export function isLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

/** Vyberie češtinu iba vtedy, keď ju prehliadač preferuje pred slovenčinou. */
export function localeFromAcceptLanguage(header: string | null): AppLocale {
  if (!header) return DEFAULT_LOCALE;
  const ranked = header
    .split(",")
    .map((part) => {
      const [tag = "", ...params] = part.trim().toLowerCase().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      return { lang: tag.split("-")[0] ?? "", q: q ? Number(q.trim().slice(2)) || 0 : 1 };
    })
    .sort((a, b) => b.q - a.q);
  for (const { lang } of ranked) {
    if (lang === "sk") return "sk";
    if (lang === "cs") return "cs";
  }
  return DEFAULT_LOCALE;
}
