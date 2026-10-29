"use client";

import { useActionState, useState } from "react";
import { Star } from "lucide-react";
import { addBugCommentAction, createBugReportAction, updateBugStatusAction, upsertReviewAction } from "@/app/actions/community";
import { FormAlert, SubmitButton } from "@/components/forms/fields";
import type { Dictionary } from "@/i18n/dictionaries/sk";
import { INITIAL_FORM_STATE, formatError, type FormState } from "@/lib/form-state";

function fieldMessage(t: Dictionary, state: FormState, name: string): string | undefined {
  const code = state.fieldErrors?.[name];
  return code ? formatError(t, code, state.errorParams) : undefined;
}

function TopError({ t, state }: { t: Dictionary; state: FormState }) {
  if (state.status !== "error" || !state.error || state.fieldErrors) return null;
  return <FormAlert tone="error">{formatError(t, state.error, state.errorParams)}</FormAlert>;
}

const textareaClass = "w-full rounded-[5px] border bg-bg px-3 py-2 text-sm outline-none focus:border-amber";

function StarInput({ initial, label }: { initial: number; label: string }) {
  const [value, setValue] = useState(initial);
  const [hover, setHover] = useState(0);
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="cursor-pointer" onMouseEnter={() => setHover(n)}>
            <input type="radio" name="rating" value={n} checked={value === n} onChange={() => setValue(n)} className="sr-only" />
            <Star
              size={26}
              strokeWidth={1.5}
              className={(hover || value) >= n ? "fill-amber text-amber" : "text-line-strong"}
              aria-hidden
            />
            <span className="sr-only">{n}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ReviewForm({ t, modId, initial }: { t: Dictionary; modId: string; initial: { rating: number; body: string } | null }) {
  const [state, action] = useActionState(upsertReviewAction, INITIAL_FORM_STATE);
  const bodyError = fieldMessage(t, state, "body");
  return (
    <form action={action} className="space-y-3 rounded-[5px] border border-line bg-surface p-4" noValidate key={state.attempt}>
      <input type="hidden" name="modId" value={modId} />
      {state.status === "success" && <FormAlert tone="success">{t.reviews.saved}</FormAlert>}
      <TopError t={t} state={state} />
      <StarInput initial={Number(state.values?.rating || initial?.rating || 0)} label={t.reviews.rating} />
      {fieldMessage(t, state, "rating") && <p className="text-xs text-alert">{fieldMessage(t, state, "rating")}</p>}
      <div className="space-y-1">
        <label htmlFor="review-body" className="block text-sm font-medium">
          {t.reviews.body}
        </label>
        <textarea id="review-body" name="body" rows={5} maxLength={5000} defaultValue={state.values?.body ?? initial?.body ?? ""} className={`${textareaClass} ${bodyError ? "border-alert" : "border-line"}`} />
        <p className={`text-xs ${bodyError ? "text-alert" : "text-muted"}`}>{bodyError ?? t.reviews.bodyHint}</p>
      </div>
      <div className="sm:w-56">
        <SubmitButton>{t.reviews.submit}</SubmitButton>
      </div>
    </form>
  );
}

export function BugReportForm({ t, modId, versions }: { t: Dictionary; modId: string; versions: { id: string; version: string }[] }) {
  const [state, action] = useActionState(createBugReportAction, INITIAL_FORM_STATE);
  const titleError = fieldMessage(t, state, "title");
  const descriptionError = fieldMessage(t, state, "description");
  const logError = fieldMessage(t, state, "logfile");
  return (
    <form action={action} className="space-y-3 rounded-[5px] border border-line bg-surface p-4" noValidate key={state.attempt}>
      <input type="hidden" name="modId" value={modId} />
      <TopError t={t} state={state} />
      <div className="space-y-1">
        <label htmlFor="bug-title" className="block text-sm font-medium">{t.bugs.titleField}</label>
        <input id="bug-title" name="title" maxLength={120} defaultValue={state.values?.title} className={`h-10 ${textareaClass} ${titleError ? "border-alert" : "border-line"}`} />
        {titleError && <p className="text-xs text-alert">{titleError}</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm font-medium">{t.bugs.version}</span>
          <select name="versionId" className="h-10 w-full rounded-[5px] border border-line bg-bg px-2 text-sm">
            {versions.map((v) => (
              <option key={v.id} value={v.id}>v{v.version}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">{t.bugs.omsiVersion}</span>
          <input name="omsiVersion" maxLength={20} defaultValue={state.values?.omsiVersion} className={`h-10 ${textareaClass} border-line font-mono`} />
        </label>
      </div>
      <div className="space-y-1">
        <label htmlFor="bug-description" className="block text-sm font-medium">{t.bugs.description}</label>
        <textarea id="bug-description" name="description" rows={5} maxLength={5000} className={`${textareaClass} ${descriptionError ? "border-alert" : "border-line"}`} />
        {descriptionError && <p className="text-xs text-alert">{descriptionError}</p>}
      </div>
      <div className="space-y-1">
        <label htmlFor="bug-logfile" className="block text-sm font-medium">{t.bugs.logfile}</label>
        <textarea
          id="bug-logfile"
          name="logfile"
          rows={8}
          spellCheck={false}
          className={`${textareaClass} font-mono text-[12px] ${logError ? "border-alert" : "border-line"}`}
          placeholder={"12:04:31 - - Error:   File not found: ...\\Splines\\..."}
        />
        <p className={`text-xs ${logError ? "text-alert" : "text-muted"}`}>{logError ?? t.bugs.logfileHint}</p>
      </div>
      <div className="sm:w-56">
        <SubmitButton>{t.bugs.submit}</SubmitButton>
      </div>
    </form>
  );
}

export function BugCommentForm({ t, bugId }: { t: Dictionary; bugId: string }) {
  const [state, action] = useActionState(addBugCommentAction, INITIAL_FORM_STATE);
  const error = fieldMessage(t, state, "body");
  return (
    <form action={action} className="space-y-2" key={state.status === "success" ? state.attempt : "comment"} noValidate>
      <input type="hidden" name="bugId" value={bugId} />
      <TopError t={t} state={state} />
      <label htmlFor="comment-body" className="block text-sm font-medium">{t.bugs.addComment}</label>
      <textarea id="comment-body" name="body" rows={3} maxLength={5000} className={`${textareaClass} ${error ? "border-alert" : "border-line"}`} />
      {error && <p className="text-xs text-alert">{error}</p>}
      <div className="sm:w-48">
        <SubmitButton variant="secondary">{t.bugs.commentSubmit}</SubmitButton>
      </div>
    </form>
  );
}

export function BugStatusForm({ t, bugId, status, fixedIn }: { t: Dictionary; bugId: string; status: string; fixedIn: string | null }) {
  const [state, action] = useActionState(updateBugStatusAction, INITIAL_FORM_STATE);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="bugId" value={bugId} />
      <label className="space-y-1">
        <span className="block text-xs text-muted">{t.bugs.changeStatus}</span>
        <select name="status" defaultValue={status} className="h-9 rounded-[5px] border border-line bg-bg px-2 text-sm">
          {Object.entries(t.bugs.status).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>
      <label className="space-y-1">
        <span className="block text-xs text-muted">{t.bugs.fixedIn}</span>
        <input name="fixedInVersion" defaultValue={fixedIn ?? ""} maxLength={30} className="h-9 w-28 rounded-[5px] border border-line bg-bg px-2 font-mono text-sm" />
      </label>
      <button type="submit" className="h-9 rounded-[5px] border border-line px-3 text-sm hover:bg-raised">{t.bugs.save}</button>
      {state.status === "error" && state.error && <span className="text-xs text-alert">{formatError(t, state.error)}</span>}
    </form>
  );
}
