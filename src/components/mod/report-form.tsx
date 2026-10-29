"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Flag } from "lucide-react";
import { createReportAction } from "@/app/actions/community";
import { FormAlert, SubmitButton } from "@/components/forms/fields";
import type { Dictionary } from "@/i18n/dictionaries/sk";
import { INITIAL_FORM_STATE, formatError } from "@/lib/form-state";

type ReportTarget = { kind: "mod"; files: { id: string; name: string }[] } | { kind: "review"; reviewId: string } | { kind: "comment"; commentId: string };

type Reason = keyof Dictionary["admin"]["reports"]["reasons"];
/** Pri recenzii a komentári dávajú zmysel iba dôvody týkajúce sa textu */
const TEXT_REASONS: Reason[] = ["SPAM", "OFFENSIVE", "OTHER"];

/**
 * „Nahlásiť“ – pri mode (kradnutý model, chýbajúce kredity, reupload, poškodený alebo podozrivý súbor),
 * pri recenzii a pri komentári v diskusii (spam, urážky).
 */
export function ReportForm({ t, modId, target }: { t: Dictionary; modId: string; target: ReportTarget }) {
  const [state, action] = useActionState(createReportAction, INITIAL_FORM_STATE);
  const r = t.admin.reports;
  const inline = target.kind !== "mod";
  const reasons = (Object.keys(r.reasons) as Reason[]).filter((reason) => !inline || TEXT_REASONS.includes(reason));
  const detailsError = state.fieldErrors?.details ? formatError(t, state.fieldErrors.details, state.errorParams) : undefined;
  const title = target.kind === "review" ? r.formTitleReview : target.kind === "comment" ? r.formTitleComment : r.formTitle;

  return (
    <details className={inline ? "group text-xs" : "group rounded-[5px] border border-line bg-surface"}>
      <summary
        className={
          inline
            ? "inline-flex cursor-pointer items-center gap-1 text-[11px] text-muted hover:text-alert"
            : "flex cursor-pointer items-center gap-1.5 px-4 py-2 text-xs text-muted hover:text-alert"
        }
      >
        <Flag size={inline ? 11 : 13} aria-hidden /> {r.button}
      </summary>
      <div className={inline ? "mt-2 rounded-[5px] border border-line bg-bg p-3" : "border-t border-line p-4"}>
        {state.status === "success" ? (
          <FormAlert tone="success">{r.sent}</FormAlert>
        ) : (
          <form action={action} className="space-y-3" noValidate key={state.attempt}>
            <input type="hidden" name="modId" value={modId} />
            {target.kind === "review" && <input type="hidden" name="reviewId" value={target.reviewId} />}
            {target.kind === "comment" && <input type="hidden" name="commentId" value={target.commentId} />}
            <p className="text-sm font-semibold">{title}</p>
            {state.status === "error" && state.error && !state.fieldErrors && <FormAlert tone="error">{formatError(t, state.error, state.errorParams)}</FormAlert>}
            <label className="block space-y-1">
              <span className="block text-xs text-muted">{r.reason}</span>
              <select name="reason" defaultValue={state.values?.reason} className="h-9 w-full rounded-[5px] border border-line bg-bg px-2 text-sm">
                {reasons.map((value) => <option key={value} value={value}>{r.reasons[value]}</option>)}
              </select>
            </label>
            {target.kind === "mod" && target.files.length > 0 && (
              <label className="block space-y-1">
                <span className="block text-xs text-muted">{r.file}</span>
                <select name="fileId" defaultValue={state.values?.fileId ?? ""} className="h-9 w-full rounded-[5px] border border-line bg-bg px-2 text-sm">
                  <option value="">{r.anyFile}</option>
                  {target.files.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </label>
            )}
            <label className="block space-y-1">
              <span className="block text-xs text-muted">{r.details}</span>
              <textarea name="details" rows={3} maxLength={2000} defaultValue={state.values?.details} className={`w-full rounded-[5px] border bg-bg px-3 py-2 text-sm ${detailsError ? "border-alert" : "border-line"}`} />
              <span className={`block text-xs ${detailsError ? "text-alert" : "text-muted"}`}>{detailsError ?? (inline ? r.detailsHintText : r.detailsHint)}</span>
            </label>
            <SubmitButton variant="secondary">{r.submit}</SubmitButton>
          </form>
        )}
      </div>
    </details>
  );
}

/** Neprihlásený návštevník: vysvetlenie namiesto skrytého tlačidla. */
export function GuestReportHint({ t, signInHref }: { t: Dictionary; signInHref: string }) {
  const r = t.admin.reports;
  return (
    <details className="group rounded-[5px] border border-line bg-surface">
      <summary className="flex cursor-pointer items-center gap-1.5 px-4 py-2 text-xs text-muted hover:text-alert">
        <Flag size={13} aria-hidden /> {r.button}
      </summary>
      <p className="border-t border-line p-4 text-sm text-muted">
        {r.guestHint}{" "}
        <Link href={signInHref} className="text-amber underline underline-offset-2">{r.signIn}</Link>
        {" · "}
        <Link href="/kontakt" className="text-amber underline underline-offset-2">{r.contact}</Link>
      </p>
    </details>
  );
}
