import type { ZodError } from "zod";
import type { Dictionary } from "@/i18n/dictionaries/sk";

export type AuthErrorCode = keyof Dictionary["auth"]["errors"];

/** Stav formulára vracaný Server Actions (serializovateľný, bez citlivých údajov). */
export type FormState = {
  status: "idle" | "error" | "success";
  error?: AuthErrorCode;
  errorParams?: Record<string, string>;
  fieldErrors?: Partial<Record<string, AuthErrorCode>>;
  /** Necitlivé vstupy na znovuvyplnenie formulára po chybe (nikdy nie heslá) */
  values?: Record<string, string>;
  /** Email pre ďalší krok (napr. opätovné odoslanie overenia) */
  email?: string;
  /** Mení sa pri každej odpovedi – resetuje Turnstile widget */
  attempt: number;
};

export const INITIAL_FORM_STATE: FormState = { status: "idle", attempt: 0 };

export function isAuthErrorCode(value: unknown, dictionary: Dictionary): value is AuthErrorCode {
  return typeof value === "string" && value in dictionary.auth.errors;
}

/** Prvá chyba pre každé pole zo zod validácie. */
export function zodFieldErrors(error: ZodError): Partial<Record<string, AuthErrorCode>> {
  const result: Partial<Record<string, AuthErrorCode>> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "_form");
    if (!(field in result)) result[field] = issue.message as AuthErrorCode;
  }
  return result;
}

export function formatError(dictionary: Dictionary, code: AuthErrorCode, params?: Record<string, string>): string {
  const template = dictionary.auth.errors[code] ?? dictionary.auth.errors.GENERIC;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => params?.[key] ?? "");
}
