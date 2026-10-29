"use client";

import { useRef } from "react";

/** GET formulár filtrov: bez JavaScriptu funguje cez tlačidlo, s JS sa odošle hneď po zmene. */
export function AutoSubmitForm({ children, className }: { children: React.ReactNode; className?: string }) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={form}
      method="get"
      action="/mody"
      className={className}
      onChange={(event) => {
        const target = event.target as HTMLElement;
        if (target instanceof HTMLSelectElement || (target instanceof HTMLInputElement && target.type === "checkbox")) {
          form.current?.requestSubmit();
        }
      }}
    >
      {children}
    </form>
  );
}
