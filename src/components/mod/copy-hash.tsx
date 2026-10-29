"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyHash({ value, labels }: { value: string; labels: { copy: string; copied: string } }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
      title={copied ? labels.copied : labels.copy}
      aria-label={copied ? labels.copied : labels.copy}
      className="grid size-6 shrink-0 place-items-center rounded-[3px] text-muted hover:bg-raised hover:text-text"
    >
      {copied ? <Check size={13} strokeWidth={2} className="text-signal" aria-hidden /> : <Copy size={13} strokeWidth={1.75} aria-hidden />}
    </button>
  );
}
