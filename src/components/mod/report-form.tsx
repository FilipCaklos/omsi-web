"use client";

import { useActionState } from "react";
import { Flag } from "lucide-react";
import { createReportAction } from "@/app/actions/community";
import { FormAlert, SubmitButton } from "@/components/forms/fields";
import type { Dictionary } from "@/i18n/dictionaries/sk";
import { INITIAL_FORM_STATE, formatError } from "@/lib/form-state";

/** „Nahlásiť“ – kradnutý model, chýbajúce kredity, reupload, poškodený alebo podozrivý súbor. */
export function ReportForm({ t, modId, files }: { t: Dictionary; modId: string; files: { id: string; name: string }[] }) {
  const [state, action] = useActionState(createReportAction, INITIAL_FORM_STATE);
  const r = t.admin.reports;
  const detailsError = state.fieldErrors?.details ? formatError(t, state.fieldErrors.details, state.errorParams) : undefined;

  return (
    <details className="group rounded-[5px] border border-line bg-surface">
      <summary className="flex cursor-pointer items-center gap-1.5 px-4 py-2 text-xs text-muted hover:text-alert">
        <Flag size={13} aria-hidden /> {r.button}
      </summary>
      <div className="border-t border-line p-4">
        {state.status === "success" ? (
          <FormAlert tone="success">{r.sent}</FormAlert>
        ) : (
          <form action={action} className="space-y-3" noValidate>
            <input type="hidden" name="modId" value={modId} />
            <p className="text-sm font-semibold">{r.formTitle}</p>
            {state.status === "error" && state.error && !state.fieldErrors && <FormAlert tone="error">{formatError(t, state.error, state.errorParams)}</FormAlert>}
            <label className="block space-y-1">
              <span className="block text-xs text-muted">{r.reason}</span>
              <select name="reason" className="h-9 w-full rounded-[5px] border border-line bg-bg px-2 text-sm">
                {Object.entries(r.reasons).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            {files.length > 0 && (
              <label className="block space-y-1">
                <span className="block text-xs text-muted">{r.file}</span>
                <select name="fileId" className="h-9 w-full rounded-[5px] border border-line bg-bg px-2 text-sm">
                  <option value="">{r.anyFile}</option>
                  {files.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </label>
            )}
            <label className="block space-y-1">
              <span className="block text-xs text-muted">{r.details}</span>
              <textarea name="details" rows={3} maxLength={2000} className={`w-full rounded-[5px] border bg-bg px-3 py-2 text-sm ${detailsError ? "border-alert" : "border-line"}`} />
              <span className={`block text-xs ${detailsError ? "text-alert" : "text-muted"}`}>{detailsError ?? r.detailsHint}</span>
            </label>
            <SubmitButton variant="secondary">{r.submit}</SubmitButton>
          </form>
        )}
      </div>
    </details>
  );
}
