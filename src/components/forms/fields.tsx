"use client";

import { useFormStatus } from "react-dom";
import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";

export function TextField({
  name,
  label,
  type = "text",
  autoComplete,
  defaultValue,
  hint,
  error,
  required = true,
  maxLength,
  minLength,
  inputMode,
}: {
  name: string;
  label: string;
  type?: "text" | "email" | "password";
  autoComplete?: string;
  defaultValue?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  maxLength?: number;
  minLength?: number;
  inputMode?: "email" | "text";
}) {
  const id = `field-${name}`;
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        required={required}
        maxLength={maxLength}
        minLength={minLength}
        inputMode={inputMode}
        spellCheck={false}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={[
          "h-10 w-full rounded-[5px] border bg-bg px-3 text-sm outline-none transition-colors",
          error ? "border-alert" : "border-line focus:border-amber",
        ].join(" ")}
      />
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs text-alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function SubmitButton({ children, variant = "primary" }: { children: React.ReactNode; variant?: "primary" | "secondary" }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={[
        "inline-flex h-10 w-full items-center justify-center gap-2 rounded-[5px] px-4 text-sm font-semibold transition-colors disabled:cursor-wait disabled:opacity-70",
        variant === "primary"
          ? "bg-amber text-amber-ink hover:bg-amber-hover"
          : "border border-line bg-surface text-text hover:bg-raised",
      ].join(" ")}
    >
      {pending && <LoaderCircle size={16} className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function FormAlert({ tone, children }: { tone: "error" | "success"; children: React.ReactNode }) {
  const Icon = tone === "error" ? CircleAlert : CircleCheck;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={[
        "flex items-start gap-2 rounded-[5px] border px-3 py-2.5 text-sm",
        tone === "error" ? "border-alert/40 bg-alert-soft text-alert" : "border-signal/40 bg-signal-soft text-signal",
      ].join(" ")}
    >
      <Icon size={16} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden />
      <div className="text-text">{children}</div>
    </div>
  );
}
