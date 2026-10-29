"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCALE_COOKIE, THEME_COOKIE, isLocale, isTheme } from "@/i18n/config";

const ONE_YEAR = 60 * 60 * 24 * 365;

const preferenceCookie = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: ONE_YEAR,
} as const;

export async function setLocaleAction(locale: unknown): Promise<void> {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, preferenceCookie);
  revalidatePath("/", "layout");
}

export async function setThemeAction(theme: unknown): Promise<void> {
  if (!isTheme(theme)) return;
  (await cookies()).set(THEME_COOKIE, theme, preferenceCookie);
}
