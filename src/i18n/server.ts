import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import {
  DEFAULT_THEME,
  LOCALE_COOKIE,
  THEME_COOKIE,
  isLocale,
  isTheme,
  localeFromAcceptLanguage,
  type AppLocale,
  type Theme,
} from "./config";
import { cs } from "./dictionaries/cs";
import { sk, type Dictionary } from "./dictionaries/sk";

const DICTIONARIES: Record<AppLocale, Dictionary> = { sk, cs };

export const getLocale = cache(async (): Promise<AppLocale> => {
  const stored = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(stored)) return stored;
  return localeFromAcceptLanguage((await headers()).get("accept-language"));
});

export const getTheme = cache(async (): Promise<Theme> => {
  const stored = (await cookies()).get(THEME_COOKIE)?.value;
  return isTheme(stored) ? stored : DEFAULT_THEME;
});

export async function getDictionary(): Promise<{ locale: AppLocale; t: Dictionary }> {
  const locale = await getLocale();
  return { locale, t: DICTIONARIES[locale] };
}
