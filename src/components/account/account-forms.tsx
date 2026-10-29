"use client";

import { useActionState } from "react";
import { changePasswordAction, updateProfileAction } from "@/app/actions/account";
import { FormAlert, SubmitButton, TextField } from "@/components/forms/fields";
import type { Dictionary } from "@/i18n/dictionaries/sk";
import { INITIAL_FORM_STATE, formatError, type FormState } from "@/lib/form-state";

function fieldError(t: Dictionary, state: FormState, name: string): string | undefined {
  const code = state.fieldErrors?.[name];
  return code ? formatError(t, code) : undefined;
}

export function ProfileForm({
  t,
  initial,
}: {
  t: Dictionary;
  initial: { name: string; bio: string; locale: "sk" | "cs"; emailNotify: boolean; websiteUrl: string; youtubeUrl: string; discordUrl: string; donateUrl: string };
}) {
  const [state, action] = useActionState(updateProfileAction, INITIAL_FORM_STATE);
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.status === "success" && <FormAlert tone="success">{t.account.saved}</FormAlert>}
      {state.status === "error" && state.error && (
        <FormAlert tone="error">{formatError(t, state.error, state.errorParams)}</FormAlert>
      )}
      <TextField name="name" label={t.account.displayName} defaultValue={initial.name} maxLength={40} error={fieldError(t, state, "name")} />
      <div className="space-y-1">
        <label htmlFor="field-bio" className="block text-sm font-medium">
          {t.account.bio}
        </label>
        <textarea
          id="field-bio"
          name="bio"
          rows={4}
          maxLength={500}
          defaultValue={initial.bio}
          className="w-full rounded-[5px] border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-amber"
        />
        <p className="text-xs text-muted">{fieldError(t, state, "bio") ?? t.account.bioHint}</p>
      </div>
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">{t.account.links}</legend>
        <p className="text-xs text-muted">{t.account.linksHint}</p>
        <TextField name="youtubeUrl" label="YouTube" defaultValue={initial.youtubeUrl} required={false} maxLength={200} error={fieldError(t, state, "youtubeUrl")} />
        <TextField name="discordUrl" label={t.account.discordLink} defaultValue={initial.discordUrl} required={false} maxLength={200} error={fieldError(t, state, "discordUrl")} />
        <TextField name="websiteUrl" label={t.account.website} defaultValue={initial.websiteUrl} required={false} maxLength={200} error={fieldError(t, state, "websiteUrl")} />
        <TextField name="donateUrl" label={t.account.donate} hint={t.account.donateHint} defaultValue={initial.donateUrl} required={false} maxLength={200} error={fieldError(t, state, "donateUrl")} />
      </fieldset>
      <div className="space-y-1">
        <label htmlFor="field-locale" className="block text-sm font-medium">
          {t.account.locale}
        </label>
        <select
          id="field-locale"
          name="locale"
          defaultValue={initial.locale}
          className="h-10 w-full rounded-[5px] border border-line bg-bg px-3 text-sm outline-none focus:border-amber"
        >
          <option value="sk">Slovenčina</option>
          <option value="cs">Čeština</option>
        </select>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="emailNotify" defaultChecked={initial.emailNotify} className="mt-0.5 size-4 accent-[var(--amber)]" />
        <span>{t.account.emailNotify}</span>
      </label>
      <div className="sm:w-48">
        <SubmitButton>{t.account.save}</SubmitButton>
      </div>
    </form>
  );
}

export function ChangePasswordForm({ t }: { t: Dictionary }) {
  const [state, action] = useActionState(changePasswordAction, INITIAL_FORM_STATE);
  return (
    <form action={action} className="space-y-4" noValidate key={state.status === "success" ? state.attempt : "form"}>
      {state.status === "success" && <FormAlert tone="success">{t.account.changed}</FormAlert>}
      {state.status === "error" && state.error && !state.fieldErrors && (
        <FormAlert tone="error">{formatError(t, state.error, state.errorParams)}</FormAlert>
      )}
      <TextField
        name="currentPassword"
        type="password"
        label={t.account.currentPassword}
        autoComplete="current-password"
        maxLength={128}
        error={fieldError(t, state, "currentPassword")}
      />
      <TextField
        name="password"
        type="password"
        label={t.account.newPassword}
        autoComplete="new-password"
        minLength={10}
        maxLength={128}
        hint={t.auth.signUp.passwordHint}
        error={fieldError(t, state, "password")}
      />
      <TextField
        name="passwordConfirm"
        type="password"
        label={t.auth.passwordConfirm}
        autoComplete="new-password"
        maxLength={128}
        error={fieldError(t, state, "passwordConfirm")}
      />
      <div className="sm:w-48">
        <SubmitButton>{t.account.changeSubmit}</SubmitButton>
      </div>
    </form>
  );
}
