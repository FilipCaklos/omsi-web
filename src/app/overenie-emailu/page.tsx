import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { FormAlert } from "@/components/forms/fields";
import { getDictionary } from "@/i18n/server";
import { getCurrentUser } from "@/server/session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return { title: t.auth.verify.successTitle, robots: { index: false } };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Cieľ odkazu z overovacieho emailu (Better Auth sem presmeruje po /api/auth/verify-email). */
export default async function VerifyEmailPage({ searchParams }: { searchParams: SearchParams }) {
  const { t } = await getDictionary();
  const params = await searchParams;
  const user = await getCurrentUser();
  const failed = typeof params.error === "string";

  const button = (href: string, label: string) => (
    <Link
      href={href}
      className="inline-flex h-10 w-full items-center justify-center rounded-[5px] bg-amber text-sm font-semibold text-amber-ink hover:bg-amber-hover"
    >
      {label}
    </Link>
  );

  if (failed) {
    return (
      <AuthShell title={t.auth.verify.errorTitle}>
        <FormAlert tone="error">{t.auth.verify.errorBody}</FormAlert>
        {button("/prihlasenie", t.auth.signIn.submit)}
      </AuthShell>
    );
  }

  if (user?.emailVerified) {
    return (
      <AuthShell title={t.auth.verify.successTitle}>
        <FormAlert tone="success">{t.auth.verify.successBody}</FormAlert>
        {button("/", t.auth.verify.continue)}
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t.auth.verify.pendingTitle}>
      <p className="text-sm text-muted">{t.auth.verify.pendingBody}</p>
      {button("/prihlasenie", t.auth.signIn.submit)}
    </AuthShell>
  );
}
