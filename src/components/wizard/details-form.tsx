"use client";

import { useActionState, useState, useTransition } from "react";
import { Eye, Pencil } from "lucide-react";
import { previewMarkdownAction, saveDetailsAction } from "@/app/actions/wizard";
import { FormAlert, SubmitButton, TextField } from "@/components/forms/fields";
import { AttributeFields } from "@/components/wizard/attribute-fields";
import type { AppLocale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/sk";
import { fieldInputName, type Attributes, type FieldDef } from "@/lib/category-fields";
import { INITIAL_FORM_STATE, formatError } from "@/lib/form-state";
import { OPEN_OMSI_URL, OPEN_OMSI_VALUES, type OpenOmsiSupport } from "@/lib/open-omsi";

type Option = { id: string; name: string };

/** Hodnoty z odoslaného formulára (state.values) späť na typy polí – aby sa po chybe nestratili. */
function draftAttributes(fields: FieldDef[], values: Record<string, string>): Attributes {
  const result: Attributes = {};
  for (const field of fields) {
    const raw = values[fieldInputName(field.key)];
    if (raw === undefined || raw === "") continue;
    result[field.key] = field.type === "MULTISELECT" ? raw.split(",") : field.type === "BOOLEAN" ? raw === "on" : raw;
  }
  return result;
}

export function DetailsForm({
  t,
  locale,
  modId,
  brands,
  operators,
  fields,
  facets,
  initial,
}: {
  t: Dictionary;
  locale: AppLocale;
  modId: string;
  brands: Option[];
  operators: Option[];
  /** Vlastné polia kategórie modu */
  fields: FieldDef[];
  /** Ktoré spoločné polia sa kategórie týkajú (značka/model, dopravca) */
  facets: { brand: boolean; operator: boolean };
  initial: {
    attributes: Attributes;
    description: string;
    vehicleModel: string;
    tags: string;
    youtube: string;
    requires4gb: boolean;
    openOmsi: OpenOmsiSupport;
    brandIds: string[];
    operatorIds: string[];
  };
}) {
  const [state, action] = useActionState(saveDetailsAction, INITIAL_FORM_STATE);
  const [description, setDescription] = useState(initial.description);
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const w = t.wizard;
  const err = (name: string) => {
    const code = state.fieldErrors?.[name];
    return code ? formatError(t, code) : undefined;
  };
  // Po chybe vyplníme formulár odoslanými hodnotami, inak uloženými
  const draft = state.values;
  const listFrom = (key: string, saved: string[]) => (draft ? (draft[key] ?? "").split(",").filter(Boolean) : saved);

  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="modId" value={modId} />
      {state.status === "error" && state.error && !state.fieldErrors && <FormAlert tone="error">{formatError(t, state.error)}</FormAlert>}

      {fields.length > 0 && (
        <fieldset className="space-y-3 rounded-[5px] border border-line p-4">
          <legend className="px-1 text-sm font-semibold">{w.parameters}</legend>
          <p className="-mt-1 text-xs text-muted">{w.parametersHint}</p>
          <AttributeFields
            locale={locale}
            fields={fields}
            values={draft ? draftAttributes(fields, draft) : initial.attributes}
            errorFor={(key) => err(fieldInputName(key))}
            requiredMark={w.requiredMark}
          />
        </fieldset>
      )}

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label htmlFor="field-description" className="text-sm font-medium">{w.description}</label>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              preview === null
                ? startTransition(async () => setPreview(await previewMarkdownAction(description)))
                : setPreview(null)
            }
            className="inline-flex items-center gap-1 text-xs text-muted hover:text-text"
          >
            {preview === null ? <Eye size={13} aria-hidden /> : <Pencil size={13} aria-hidden />}
            {preview === null ? w.preview : w.edit}
          </button>
        </div>
        <textarea
          id="field-description"
          name="description"
          rows={14}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={50_000}
          hidden={preview !== null}
          className="w-full rounded-[5px] border border-line bg-bg px-3 py-2 font-mono text-[13px] outline-none focus:border-amber"
        />
        {preview !== null && (
          <div className="prose-omsi min-h-40 rounded-[5px] border border-line bg-surface p-4" dangerouslySetInnerHTML={{ __html: preview }} />
        )}
        <p className={`text-xs ${err("description") ? "text-alert" : "text-muted"}`}>{err("description") ?? w.descriptionHint}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {facets.brand && (
          <TextField name="vehicleModel" label={w.vehicleModel} hint={w.vehicleModelHint} defaultValue={draft?.vehicleModel ?? initial.vehicleModel} required={false} maxLength={60} />
        )}
        <TextField name="tags" label={w.tags} hint={w.tagsHint} defaultValue={draft?.tags ?? initial.tags} required={false} maxLength={350} error={err("tags")} />
      </div>

      {facets.brand && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{w.brands}</legend>
          <div className="flex flex-wrap gap-2">
            {brands.map((b) => (
              <label key={b.id} className="inline-flex cursor-pointer items-center gap-1.5 rounded-[5px] border border-line px-2.5 py-1.5 text-sm has-[:checked]:border-amber has-[:checked]:bg-amber-soft">
                <input type="checkbox" name="brandIds" value={b.id} defaultChecked={listFrom("brandIds", initial.brandIds).includes(b.id)} className="accent-[var(--amber)]" />
                {b.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {facets.operator && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{w.operators}</legend>
          <div className="flex flex-wrap gap-2">
            {operators.map((o) => (
              <label key={o.id} className="inline-flex cursor-pointer items-center gap-1.5 rounded-[5px] border border-line px-2.5 py-1.5 text-sm has-[:checked]:border-amber has-[:checked]:bg-amber-soft">
                <input type="checkbox" name="operatorIds" value={o.id} defaultChecked={listFrom("operatorIds", initial.operatorIds).includes(o.id)} className="accent-[var(--amber)]" />
                {o.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="space-y-1">
        <label htmlFor="field-openOmsi" className="block text-sm font-medium">{t.openOmsi.label}</label>
        <select
          id="field-openOmsi"
          name="openOmsi"
          defaultValue={draft?.openOmsi ?? initial.openOmsi}
          className="h-10 w-full rounded-[5px] border border-line bg-bg px-2 text-sm sm:w-72"
        >
          {OPEN_OMSI_VALUES.map((value) => (
            <option key={value} value={value}>{t.openOmsi.values[value]}</option>
          ))}
        </select>
        <p className="text-xs text-muted">
          {t.openOmsi.hint}{" "}
          <a href={OPEN_OMSI_URL} target="_blank" rel="noopener noreferrer" className="text-amber underline underline-offset-2">github.com/turbo-devv/openOMSI</a>
        </p>
      </div>

      <TextField name="youtube" label={w.youtube} defaultValue={draft?.youtube ?? initial.youtube} required={false} maxLength={200} error={err("youtube")} />

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="requires4gb" defaultChecked={draft ? draft.requires4gb === "on" : initial.requires4gb} className="size-4 accent-[var(--amber)]" />
        {w.requires4gb}
      </label>

      <div className="sm:w-60">
        <SubmitButton>{w.saveContinue}</SubmitButton>
      </div>
    </form>
  );
}
