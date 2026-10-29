"use client";

import { useActionState } from "react";
import { submitModAction } from "@/app/actions/wizard";
import { FormAlert, SubmitButton } from "@/components/forms/fields";
import type { Dictionary } from "@/i18n/dictionaries/sk";
import { INITIAL_FORM_STATE, formatError } from "@/lib/form-state";

export function SubmitForm({ t, modId, verified, disabled }: { t: Dictionary; modId: string; verified: boolean; disabled: boolean }) {
  const [state, action] = useActionState(submitModAction, INITIAL_FORM_STATE);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="modId" value={modId} />
      {state.status === "error" && state.error && <FormAlert tone="error">{formatError(t, state.error, state.errorParams)}</FormAlert>}
      <p className="text-sm text-muted">{verified ? t.wizard.submitNoteVerified : t.wizard.submitNoteUser}</p>
      <fieldset disabled={disabled} className="sm:w-64 disabled:opacity-50">
        <SubmitButton>{verified ? t.wizard.submitVerified : t.wizard.submit}</SubmitButton>
      </fieldset>
    </form>
  );
}
