import { headers } from "next/headers";
import { SiteHeader } from "@/components/layout/site-header";

export async function getCspNonce(): Promise<string | undefined> {
  return (await headers()).get("x-nonce") ?? undefined;
}

/** Spoločný rám stránok prihlásenia – úzka karta, žiadny marketing. */
export async function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <main id="obsah" className="mx-auto w-full max-w-[420px] px-4 py-10">
        <div className="rounded-[5px] border border-line bg-surface">
          <div className="border-b border-line px-5 py-4">
            <h1 className="text-lg font-bold">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          </div>
          <div className="space-y-4 px-5 py-5">{children}</div>
        </div>
        {footer && <div className="mt-4 text-center text-sm text-muted">{footer}</div>}
      </main>
    </>
  );
}

export function OrDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted">
      <span className="h-px flex-1 bg-line" />
      {label}
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
