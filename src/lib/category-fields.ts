/**
 * Vlastné polia kategórií (parametre modu). Čisté funkcie bez DB – používa ich server (validácia,
 * katalóg, vyhľadávanie) aj formuláre. Definície polí spravuje administrátor v /admin/kategorie.
 */
import type { AppLocale } from "@/i18n/config";

export const FIELD_TYPES = ["TEXT", "NUMBER", "SELECT", "MULTISELECT", "BOOLEAN"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];
/** Typy, podľa ktorých sa dá v katalógu filtrovať */
export const FILTERABLE_TYPES: readonly FieldType[] = ["SELECT", "MULTISELECT", "BOOLEAN"];

export type FieldOption = { value: string; sk: string; cs: string };

export type FieldDef = {
  key: string;
  labelSk: string;
  labelCs: string;
  hintSk: string;
  hintCs: string;
  type: FieldType;
  options: FieldOption[];
  unit: string;
  required: boolean;
  filterable: boolean;
};

export type AttributeValue = string | number | boolean | string[];
export type Attributes = Record<string, AttributeValue>;
export type AttributeError = "ATTRIBUTE_REQUIRED" | "ATTRIBUTE_INVALID";

export const FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]{1,39}$/;
const OPTION_VALUE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/;
export const MAX_TEXT_LENGTH = 120;
const MAX_OPTIONS = 40;

/** Názov vstupu vo formulári a parametra filtra v URL (prefix oddelí polia od ostatných parametrov). */
export const fieldInputName = (key: string) => `attr_${key}`;
export const filterParamName = (key: string) => `p_${key}`;

export function localizedLabel(field: Pick<FieldDef, "labelSk" | "labelCs">, locale: AppLocale): string {
  return locale === "cs" ? field.labelCs : field.labelSk;
}

export function localizedHint(field: Pick<FieldDef, "hintSk" | "hintCs">, locale: AppLocale): string {
  return locale === "cs" ? field.hintCs : field.hintSk;
}

export function optionLabel(option: FieldOption, locale: AppLocale): string {
  return locale === "cs" ? option.cs : option.sk;
}

/** Hodnota možnosti bez diakritiky: „Kĺbový (18 m)“ → „klbovy-18-m“. */
export function optionValueFrom(label: string): string {
  return (
    label
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/g, "") || "moznost"
  );
}

/** Možnosti z DB (JSON) – nevalidné položky zahodí. */
export function parseOptions(json: unknown): FieldOption[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((item): FieldOption[] => {
    if (typeof item !== "object" || item === null) return [];
    const { value, sk, cs } = item as Record<string, unknown>;
    if (typeof value !== "string" || !OPTION_VALUE_PATTERN.test(value) || typeof sk !== "string" || typeof cs !== "string") return [];
    return [{ value, sk, cs }];
  });
}

/**
 * Možnosti z textového poľa administrácie, jedna na riadok:
 *   „hodnota | SK názov | CZ názov“  alebo  „SK názov | CZ názov“  alebo  „Názov“.
 * Hodnota sa ukladá k modom – pri premenovaní ostáva, preto ju administrácia zobrazuje.
 */
export function parseOptionLines(text: string): { options: FieldOption[] } | { error: "OPTIONS_INVALID" } {
  const options: FieldOption[] = [];
  for (const line of text.split(/\r?\n/)) {
    const parts = line.split("|").map((p) => p.trim());
    if (parts.every((p) => p === "")) continue;
    const [first = "", second = "", third = ""] = parts;
    const option =
      parts.length >= 3 ? { value: first, sk: second, cs: third || second }
      : parts.length === 2 ? { value: optionValueFrom(first), sk: first, cs: second || first }
      : { value: optionValueFrom(first), sk: first, cs: first };
    if (!OPTION_VALUE_PATTERN.test(option.value) || option.sk.length === 0 || option.sk.length > 80 || option.cs.length > 80) {
      return { error: "OPTIONS_INVALID" };
    }
    if (options.some((o) => o.value === option.value)) return { error: "OPTIONS_INVALID" };
    options.push(option);
  }
  if (options.length > MAX_OPTIONS) return { error: "OPTIONS_INVALID" };
  return { options };
}

export function formatOptionLines(options: FieldOption[]): string {
  return options.map((o) => `${o.value} | ${o.sk} | ${o.cs}`).join("\n");
}

/** Hodnoty z DB (JSON) – iba podporované typy. */
export function readAttributes(json: unknown): Attributes {
  if (typeof json !== "object" || json === null || Array.isArray(json)) return {};
  const result: Attributes = {};
  for (const [key, value] of Object.entries(json as Record<string, unknown>)) {
    if (!FIELD_KEY_PATTERN.test(key)) continue;
    if (typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) result[key] = value;
    else if (Array.isArray(value) && value.every((v) => typeof v === "string")) result[key] = value as string[];
  }
  return result;
}

function isEmpty(value: AttributeValue | undefined): boolean {
  return value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

/**
 * Hodnoty z odoslaného formulára podľa definícií polí. Neznáme polia ignoruje,
 * BOOLEAN ukladá iba keď je zaškrtnuté (filter „áno“ hľadá true).
 */
export function parseAttributeForm(
  fields: readonly FieldDef[],
  input: { get(name: string): string | undefined; getAll(name: string): string[] },
): { values: Attributes; errors: Record<string, AttributeError> } {
  const values: Attributes = {};
  const errors: Record<string, AttributeError> = {};

  for (const field of fields) {
    const name = fieldInputName(field.key);
    let value: AttributeValue | undefined;

    if (field.type === "TEXT") {
      const text = (input.get(name) ?? "").trim().replace(/\s+/g, " ");
      if (text.length > MAX_TEXT_LENGTH) errors[field.key] = "ATTRIBUTE_INVALID";
      else if (text) value = text;
    } else if (field.type === "NUMBER") {
      const raw = (input.get(name) ?? "").trim().replace(",", ".");
      if (raw) {
        const number = Number(raw);
        if (!Number.isFinite(number) || Math.abs(number) > 1_000_000_000) errors[field.key] = "ATTRIBUTE_INVALID";
        else value = number;
      }
    } else if (field.type === "SELECT") {
      const raw = input.get(name) ?? "";
      if (raw) {
        if (field.options.some((o) => o.value === raw)) value = raw;
        else errors[field.key] = "ATTRIBUTE_INVALID";
      }
    } else if (field.type === "MULTISELECT") {
      const allowed = new Set(field.options.map((o) => o.value));
      const picked = [...new Set(input.getAll(name))];
      if (picked.some((v) => !allowed.has(v))) errors[field.key] = "ATTRIBUTE_INVALID";
      else if (picked.length > 0) value = field.options.map((o) => o.value).filter((v) => picked.includes(v));
    } else if (input.get(name) === "on") {
      value = true;
    }

    if (errors[field.key]) continue;
    if (field.required && field.type !== "BOOLEAN" && isEmpty(value)) errors[field.key] = "ATTRIBUTE_REQUIRED";
    else if (value !== undefined) values[field.key] = value;
  }
  return { values, errors };
}

/** Kľúče povinných polí, ktoré mod nemá vyplnené (kontrola pred odoslaním). */
export function missingRequired(fields: readonly FieldDef[], attributes: Attributes): string[] {
  return fields.filter((f) => f.required && f.type !== "BOOLEAN" && isEmpty(attributes[f.key])).map((f) => f.key);
}

/** Čitateľná hodnota pre detail modu; null = nezobrazovať. */
export function formatAttribute(field: FieldDef, value: AttributeValue | undefined, locale: AppLocale, yes: string): string | null {
  if (isEmpty(value)) return null;
  const label = (v: string) => {
    const option = field.options.find((o) => o.value === v);
    return option ? optionLabel(option, locale) : null;
  };
  switch (field.type) {
    case "TEXT":
      return typeof value === "string" ? value : null;
    case "NUMBER":
      return typeof value === "number" ? `${value.toLocaleString(locale === "cs" ? "cs-CZ" : "sk-SK")}${field.unit ? ` ${field.unit}` : ""}` : null;
    case "SELECT":
      return typeof value === "string" ? label(value) : null;
    case "MULTISELECT":
      return Array.isArray(value) ? value.map(label).filter((v): v is string => v !== null).join(", ") || null : null;
    case "BOOLEAN":
      return value === true ? yes : null;
  }
}

/** Texty pre vyhľadávanie: textové hodnoty a názvy vybraných možností v oboch jazykoch. */
export function attributeSearchTerms(fields: readonly FieldDef[], attributes: Attributes): string[] {
  const terms: string[] = [];
  for (const field of fields) {
    const value = attributes[field.key];
    if (typeof value === "string" && field.type === "TEXT") terms.push(value);
    const picked = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
    if (field.type === "SELECT" || field.type === "MULTISELECT") {
      for (const option of field.options) if (picked.includes(option.value)) terms.push(option.sk, option.cs);
    }
  }
  return terms;
}

/** Aktívne filtre z URL: iba filtrovateľné polia a platné hodnoty. Výsledok ide do JSONB @> podmienky. */
export function parseAttributeFilters(
  fields: readonly FieldDef[],
  params: Record<string, string | string[] | undefined>,
): Attributes {
  const filters: Attributes = {};
  for (const field of fields) {
    if (!field.filterable || !FILTERABLE_TYPES.includes(field.type)) continue;
    const raw = params[filterParamName(field.key)];
    const value = typeof raw === "string" ? raw : undefined;
    if (!value) continue;
    if (field.type === "BOOLEAN" && value === "1") filters[field.key] = true;
    else if (field.type === "SELECT" && field.options.some((o) => o.value === value)) filters[field.key] = value;
    else if (field.type === "MULTISELECT" && field.options.some((o) => o.value === value)) filters[field.key] = [value];
  }
  return filters;
}
