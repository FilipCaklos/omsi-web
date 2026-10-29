"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  requestPasswordResetAction,
  resendVerificationAction,
  resetPasswordAction,
  signInAction,
  signUpAction,
} from "@/app/actions/auth";
import { FormAlert, SubmitButton, TextField } from "@/components/forms/fields";
import { TurnstileWidget } from "@/components/forms/turnstile-widget";
import type { Dictionary } from "@/i18n/dictionaries/sk";
import { INITIAL_FORM_STATE, formatError, type FormState } from "@/lib/form-state";

type Common = { t: Dictionary; locale: "sk" | "cs" };
type WithTurnstile = Common & { siteKey: string; nonce: string | undefined };

function fieldError(t: Dictionary, state: FormState, name: string): string | undefined {
  const code = state.fieldErrors?.[name];
  return code ? formatError(t, code) : undefined;
}

function FormError({ t, state }: { t: Dictionary; state: FormState }) {
  if (state.status !== "error" || !state.error) return null;
  return <FormAlert tone="error">{formatError(t, state.error, state.errorParams)}</FormAlert>;
}

export function ResendVerificationForm({ t, email }: { t: Dictionary; email: string }) {
  const [state, action] = useActionState(resendVerificationAction, INITIAL_FORM_STATE);
  if (state.status === "success") return <FormAlert tone="success">{t.auth.verify.resendSent}</FormAlert>;
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="email" value={email} />
      <p className="text-xs text-muted">{t.auth.signIn.unverifiedHint}</p>
      <FormError t={t} state={state} />
      <SubmitButton variant="secondary">{t.auth.signIn.resend}</SubmitButton>
    </form>
  );
}

export function SignInForm({ t, locale, siteKey, nonce, next }: WithTurnstile & { next: string }) {
  const [state, action] = useActionState(signInAction, INITIAL_FORM_STATE);
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4" noValidate key={state.attempt}>
        <input type="hidden" name="next" value={next} />
        <FormError t={t} state={state} />
        <TextField
          name="email"
          type="email"
          inputMode="email"
          label={t.auth.email}
          autoComplete="email"
          maxLength={254}
          defaultValue={state.values?.email}
          error={fieldError(t, state, "email")}
        />
        <TextField
          name="password"
          type="password"
          label={t.auth.password}
          autoComplete="current-password"
          maxLength={128}
          error={fieldError(t, state, "password")}
        />
        <div className="flex justify-end">
          <Link href="/zabudnute-heslo" className="text-xs text-muted underline-offset-2 hover:text-text hover:underline">
            {t.auth.signIn.forgot}
          </Link>
        </div>
        <TurnstileWidget siteKey={siteKey} nonce={nonce} resetKey={state.attempt} locale={locale} />
        <SubmitButton>{t.auth.signIn.submit}</SubmitButton>
      </form>
      {state.error === "EMAIL_NOT_VERIFIED" && state.email && <ResendVerificationForm t={t} email={state.email} />}
    </div>
  );
}

export function SignUpForm({ t, locale, siteKey, nonce }: WithTurnstile) {
  const [state, action] = useActionState(signUpAction, INITIAL_FORM_STATE);

  if (state.status === "success") {
    return (
      <div className="space-y-3">
        <FormAlert tone="success">
          <strong className="block">{t.auth.signUp.successTitle}</strong>
          {t.auth.signUp.successBody}
        </FormAlert>
        {state.email && <ResendVerificationForm t={t} email={state.email} />}
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4" noValidate key={state.attempt}>
      <FormError t={t} state={state} />
      <TextField
        name="name"
        label={t.auth.signUp.name}
        autoComplete="nickname"
        maxLength={40}
        defaultValue={state.values?.name}
        hint={t.auth.signUp.nameHint}
        error={fieldError(t, state, "name")}
      />
      <TextField
        name="username"
        label={t.auth.signUp.username}
        autoComplete="username"
        maxLength={24}
        defaultValue={state.values?.username}
        hint={t.auth.signUp.usernameHint}
        error={fieldError(t, state, "username")}
      />
      <TextField
        name="email"
        type="email"
        inputMode="email"
        label={t.auth.email}
        autoComplete="email"
        maxLength={254}
        defaultValue={state.values?.email}
        error={fieldError(t, state, "email")}
      />
      <TextField
        name="password"
        type="password"
        label={t.auth.password}
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
      <div className="space-y-1">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="acceptTerms" className="mt-0.5 size-4 accent-[var(--amber)]" />
          <span>
            {t.auth.signUp.acceptTerms.split(/(\{terms\}|\{privacy\})/).map((part, index) =>
              part === "{terms}" ? (
                <Link key={index} href="/podmienky" target="_blank" className="text-amber underline underline-offset-2">
                  {t.auth.signUp.termsLink}
                </Link>
              ) : part === "{privacy}" ? (
                <Link key={index} href="/ochrana-sukromia" target="_blank" className="text-amber underline underline-offset-2">
                  {t.auth.signUp.privacyLink}
                </Link>
              ) : (
                part
              ),
            )}
          </span>
        </label>
        {fieldError(t, state, "acceptTerms") && (
          <p className="text-xs text-alert">{fieldError(t, state, "acceptTerms")}</p>
        )}
      </div>
      <TurnstileWidget siteKey={siteKey} nonce={nonce} resetKey={state.attempt} locale={locale} />
      <SubmitButton>{t.auth.signUp.submit}</SubmitButton>
    </form>
  );
}

export function ForgotPasswordForm({ t, locale, siteKey, nonce }: WithTurnstile) {
  const [state, action] = useActionState(requestPasswordResetAction, INITIAL_FORM_STATE);
  if (state.status === "success") {
    return (
      <FormAlert tone="success">
        <strong className="block">{t.auth.forgot.sentTitle}</strong>
        {t.auth.forgot.sentBody}
      </FormAlert>
    );
  }
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError t={t} state={state} />
      <TextField
        name="email"
        type="email"
        inputMode="email"
        label={t.auth.email}
        autoComplete="email"
        maxLength={254}
        error={fieldError(t, state, "email")}
      />
      <TurnstileWidget siteKey={siteKey} nonce={nonce} resetKey={state.attempt} locale={locale} />
      <SubmitButton>{t.auth.forgot.submit}</SubmitButton>
    </form>
  );
}

export function ResetPasswordForm({ t, token }: Common & { token: string }) {
  const [state, action] = useActionState(resetPasswordAction, INITIAL_FORM_STATE);
  if (state.status === "success") {
    return (
      <div className="space-y-3">
        <FormAlert tone="success">
          <strong className="block">{t.auth.reset.successTitle}</strong>
          {t.auth.reset.successBody}
        </FormAlert>
        <Link
          href="/prihlasenie"
          className="inline-flex h-10 w-full items-center justify-center rounded-[5px] bg-amber text-sm font-semibold text-amber-ink hover:bg-amber-hover"
        >
          {t.auth.signIn.submit}
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="token" value={token} />
      <FormError t={t} state={state} />
      {state.error === "TOKEN_INVALID" && (
        <Link href="/zabudnute-heslo" className="block text-sm text-amber underline underline-offset-2">
          {t.auth.reset.requestNew}
        </Link>
      )}
      <TextField
        name="password"
        type="password"
        label={t.auth.password}
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
      <SubmitButton>{t.auth.reset.submit}</SubmitButton>
    </form>
  );
}
