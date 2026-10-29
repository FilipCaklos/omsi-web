"use client";

import { useActionState } from "react";
import { addDevlogCommentAction } from "@/app/actions/devlog";
import { FormAlert, SubmitButton } from "@/components/forms/fields";
import type { Dictionary } from "@/i18n/dictionaries/sk";
import { INITIAL_FORM_STATE, formatError } from "@/lib/form-state";

export function DevlogCommentForm({ t, devlogId }: { t: Dictionary; devlogId: string }) {
  const [state, action] = useActionState(addDevlogCommentAction, INITIAL_FORM_STATE);
  const error = state.fieldErrors?.body ? formatError(t, state.fieldErrors.body, state.errorParams) : undefined;
  return (
    <form action={action} className="space-y-2" key={state.status === "success" ? state.attempt : "comment"} noValidate>
      <input type="hidden" name="devlogId" value={devlogId} />
      {state.status === "error" && state.error && !state.fieldErrors && <FormAlert tone="error">{formatError(t, state.error, state.errorParams)}</FormAlert>}
      <label htmlFor={`comment-${devlogId}`} className="sr-only">{t.planned.addComment}</label>
      <textarea
        id={`comment-${devlogId}`}
        name="body"
        rows={2}
        maxLength={5000}
        placeholder={t.planned.addComment}
        className={`w-full rounded-[5px] border bg-bg px-3 py-2 text-sm outline-none focus:border-amber ${error ? "border-alert" : "border-line"}`}
      />
      {error && <p className="text-xs text-alert">{error}</p>}
      <div className="sm:w-40">
        <SubmitButton variant="secondary">{t.planned.commentSubmit}</SubmitButton>
      </div>
    </form>
  );
}
