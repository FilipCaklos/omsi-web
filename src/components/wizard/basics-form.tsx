"use client";

import { useActionState, useState } from "react";
import { createDraftAction, saveBasicsAction } from "@/app/actions/wizard";
import { FormAlert, SubmitButton, TextField } from "@/components/forms/fields";
import type { Dictionary } from "@/i18n/dictionaries/sk";
import { INITIAL_FORM_STATE, formatError, type FormState } from "@/lib/form-state";

export type CategoryOption = { id: string; name: string; subcategories: { id: string; name: string }[] };

function message(t: Dictionary, state: FormState, name: string) {
  const code = state.fieldErrors?.[name];
  return code ? formatError(t, code, state.errorParams) : undefined;
}

export function BasicsForm({
  t,
  categories,
  modId,
  initial,
}: {
  t: Dictionary;
  categories: CategoryOption[];
  modId: string | null;
  initial: { title: string; summary: string; categoryId: string; subcategoryId: string };
}) {
  const [state, action] = useActionState(modId ? saveBasicsAction : createDraftAction, INITIAL_FORM_STATE);
  const values = { ...initial, ...state.values };
  const [categoryId, setCategoryId] = useState(values.categoryId);
  const subcategories = categories.find((c) => c.id === categoryId)?.subcategories ?? [];
  const w = t.wizard;

  return (
    <form action={action} className="space-y-4" noValidate key={state.attempt}>
      {modId && <input type="hidden" name="modId" value={modId} />}
      {state.status === "error" && state.error && !state.fieldErrors && <FormAlert tone="error">{formatError(t, state.error, state.errorParams)}</FormAlert>}
      <TextField name="title" label={w.modTitle} hint={w.modTitleHint} defaultValue={values.title} maxLength={100} error={message(t, state, "title")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="block text-sm font-medium">{w.category}</span>
          <select
            name="categoryId"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className={`h-10 w-full rounded-[5px] border bg-bg px-2 text-sm ${message(t, state, "categoryId") ? "border-alert" : "border-line"}`}
          >
            <option value="">—</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {message(t, state, "categoryId") && <span className="block text-xs text-alert">{message(t, state, "categoryId")}</span>}
        </label>
        <label className="block space-y-1">
          <span className="block text-sm font-medium">{w.subcategory}</span>
          <select name="subcategoryId" defaultValue={values.subcategoryId} key={categoryId} disabled={subcategories.length === 0} className="h-10 w-full rounded-[5px] border border-line bg-bg px-2 text-sm disabled:opacity-50">
            <option value="">—</option>
            {subcategories.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          {message(t, state, "subcategoryId") && <span className="block text-xs text-alert">{message(t, state, "subcategoryId")}</span>}
        </label>
      </div>
      <div className="space-y-1">
        <label htmlFor="field-summary" className="block text-sm font-medium">{w.summary}</label>
        <textarea
          id="field-summary"
          name="summary"
          rows={2}
          maxLength={200}
          defaultValue={values.summary}
          className={`w-full rounded-[5px] border bg-bg px-3 py-2 text-sm outline-none focus:border-amber ${message(t, state, "summary") ? "border-alert" : "border-line"}`}
        />
        <p className={`text-xs ${message(t, state, "summary") ? "text-alert" : "text-muted"}`}>{message(t, state, "summary") ?? w.summaryHint}</p>
      </div>
      <div className="sm:w-60">
        <SubmitButton>{w.saveContinue}</SubmitButton>
      </div>
    </form>
  );
}
