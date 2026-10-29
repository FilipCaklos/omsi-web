import { FormAlert } from "@/components/forms/fields";
import type { Dictionary } from "@/i18n/dictionaries/sk";
import { formatError, isAuthErrorCode } from "@/lib/form-state";

export type AdminSearchParams = Promise<Record<string, string | string[] | undefined>>;

export function param(params: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const value = params[key];
  return typeof value === "string" ? value : undefined;
}

/** Výsledok admin akcie z URL (?ok=1 / ?chyba=KÓD) – akcie sú obyčajné formuláre s presmerovaním. */
export function AdminAlert({ t, params, okText }: { t: Dictionary; params: Record<string, string | string[] | undefined>; okText: string }) {
  const error = param(params, "chyba");
  if (error) return <FormAlert tone="error">{isAuthErrorCode(error, t) ? formatError(t, error) : t.auth.errors.GENERIC}</FormAlert>;
  if (param(params, "ok") === "1") return <FormAlert tone="success">{okText}</FormAlert>;
  return null;
}

export function AdminTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-bold">{children}</h1>
      {aside}
    </div>
  );
}

export const inputClass = "h-9 rounded-[5px] border border-line bg-bg px-2 text-sm outline-none focus:border-amber";
export const buttonClass = "inline-flex h-9 items-center gap-1.5 rounded-[5px] border border-line px-3 text-sm hover:bg-raised";
export const primaryButtonClass = "inline-flex h-9 items-center gap-1.5 rounded-[5px] bg-amber px-3 text-sm font-semibold text-amber-ink hover:bg-amber-hover";
export const dangerButtonClass = "inline-flex h-9 items-center gap-1.5 rounded-[5px] border border-alert/50 px-3 text-sm text-alert hover:bg-alert-soft";
