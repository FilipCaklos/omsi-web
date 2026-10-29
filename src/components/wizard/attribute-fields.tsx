"use client";

import { TextField } from "@/components/forms/fields";
import type { AppLocale } from "@/i18n/config";
import {
  MAX_TEXT_LENGTH,
  fieldInputName,
  localizedHint,
  localizedLabel,
  optionLabel,
  type Attributes,
  type FieldDef,
} from "@/lib/category-fields";

/** Vlastné polia kategórie v kroku Popis (mesto pri mape, dĺžka pri autobuse…). */
export function AttributeFields({
  locale,
  fields,
  values,
  errorFor,
  requiredMark,
}: {
  locale: AppLocale;
  fields: FieldDef[];
  values: Attributes;
  errorFor: (key: string) => string | undefined;
  requiredMark: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((field) => {
        const name = fieldInputName(field.key);
        const label = `${localizedLabel(field, locale)}${field.unit ? ` (${field.unit})` : ""}${field.required ? ` ${requiredMark}` : ""}`;
        const hint = localizedHint(field, locale) || undefined;
        const value = values[field.key];
        const error = errorFor(field.key);

        if (field.type === "TEXT" || field.type === "NUMBER") {
          return (
            <TextField
              key={field.key}
              name={name}
              label={label}
              hint={hint}
              error={error}
              defaultValue={value === undefined ? "" : String(value)}
              required={field.required}
              maxLength={field.type === "TEXT" ? MAX_TEXT_LENGTH : 20}
            />
          );
        }

        if (field.type === "SELECT") {
          const id = `field-${name}`;
          return (
            <div key={field.key} className="space-y-1">
              <label htmlFor={id} className="block text-sm font-medium">{label}</label>
              <select
                id={id}
                name={name}
                defaultValue={typeof value === "string" ? value : ""}
                aria-invalid={error ? true : undefined}
                className={`h-10 w-full rounded-[5px] border bg-bg px-2 text-sm ${error ? "border-alert" : "border-line"}`}
              >
                <option value="">—</option>
                {field.options.map((option) => (
                  <option key={option.value} value={option.value}>{optionLabel(option, locale)}</option>
                ))}
              </select>
              {error ? <p className="text-xs text-alert">{error}</p> : hint && <p className="text-xs text-muted">{hint}</p>}
            </div>
          );
        }

        if (field.type === "MULTISELECT") {
          const picked = Array.isArray(value) ? value : [];
          return (
            <fieldset key={field.key} className="space-y-2 sm:col-span-2">
              <legend className="text-sm font-medium">{label}</legend>
              <div className="flex flex-wrap gap-2">
                {field.options.map((option) => (
                  <label
                    key={option.value}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-[5px] border border-line px-2.5 py-1.5 text-sm has-[:checked]:border-amber has-[:checked]:bg-amber-soft"
                  >
                    <input type="checkbox" name={name} value={option.value} defaultChecked={picked.includes(option.value)} className="accent-[var(--amber)]" />
                    {optionLabel(option, locale)}
                  </label>
                ))}
              </div>
              {error ? <p className="text-xs text-alert">{error}</p> : hint && <p className="text-xs text-muted">{hint}</p>}
            </fieldset>
          );
        }

        return (
          <label key={field.key} className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" name={name} defaultChecked={value === true} className="size-4 accent-[var(--amber)]" />
            {label}
          </label>
        );
      })}
    </div>
  );
}
