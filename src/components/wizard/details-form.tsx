"use client";

import { useActionState, useState, useTransition } from "react";
import { Eye, Pencil } from "lucide-react";
import { previewMarkdownAction, saveDetailsAction } from "@/app/actions/wizard";
import { FormAlert, SubmitButton, TextField } from "@/components/forms/fields";
import type { Dictionary } from "@/i18n/dictionaries/sk";
import { INITIAL_FORM_STATE, formatError } from "@/lib/form-state";

type Option = { id: string; name: string };

export function DetailsForm({
  t,
  modId,
  brands,
  operators,
  initial,
}: {
  t: Dictionary;
  modId: string;
  brands: Option[];
  operators: Option[];
  initial: {
    description: string;
    vehicleModel: string;
    tags: string;
    youtube: string;
    requires4gb: boolean;
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

  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="modId" value={modId} />
      {state.status === "error" && state.error && !state.fieldErrors && <FormAlert tone="error">{formatError(t, state.error)}</FormAlert>}

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
        <TextField name="vehicleModel" label={w.vehicleModel} hint={w.vehicleModelHint} defaultValue={initial.vehicleModel} required={false} maxLength={60} />
        <TextField name="tags" label={w.tags} hint={w.tagsHint} defaultValue={initial.tags} required={false} maxLength={350} error={err("tags")} />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{w.brands}</legend>
        <div className="flex flex-wrap gap-2">
          {brands.map((b) => (
            <label key={b.id} className="inline-flex cursor-pointer items-center gap-1.5 rounded-[5px] border border-line px-2.5 py-1.5 text-sm has-[:checked]:border-amber has-[:checked]:bg-amber-soft">
              <input type="checkbox" name="brandIds" value={b.id} defaultChecked={initial.brandIds.includes(b.id)} className="accent-[var(--amber)]" />
              {b.name}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{w.operators}</legend>
        <div className="flex flex-wrap gap-2">
          {operators.map((o) => (
            <label key={o.id} className="inline-flex cursor-pointer items-center gap-1.5 rounded-[5px] border border-line px-2.5 py-1.5 text-sm has-[:checked]:border-amber has-[:checked]:bg-amber-soft">
              <input type="checkbox" name="operatorIds" value={o.id} defaultChecked={initial.operatorIds.includes(o.id)} className="accent-[var(--amber)]" />
              {o.name}
            </label>
          ))}
        </div>
      </fieldset>

      <TextField name="youtube" label={w.youtube} defaultValue={initial.youtube} required={false} maxLength={200} error={err("youtube")} />

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="requires4gb" defaultChecked={initial.requires4gb} className="size-4 accent-[var(--amber)]" />
        {w.requires4gb}
      </label>

      <div className="sm:w-60">
        <SubmitButton>{w.saveContinue}</SubmitButton>
      </div>
    </form>
  );
}
