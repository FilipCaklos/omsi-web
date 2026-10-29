import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth/auth-forms";
import { AuthShell } from "@/components/auth/auth-shell";
import { FormAlert } from "@/components/forms/fields";
import { getDictionary } from "@/i18n/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return { title: t.auth.reset.title, robots: { index: false } };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ResetPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const { locale, t } = await getDictionary();
  const params = await searchParams;
  const token = typeof params.token === "string" && /^[A-Za-z0-9_-]{10,512}$/.test(params.token) ? params.token : null;

  if (!token || typeof params.error === "string") {
    return (
      <AuthShell title={t.auth.reset.invalidTitle}>
        <FormAlert tone="error">{t.auth.reset.invalidBody}</FormAlert>
        <Link
          href="/zabudnute-heslo"
          className="inline-flex h-10 w-full items-center justify-center rounded-[5px] bg-amber text-sm font-semibold text-amber-ink hover:bg-amber-hover"
        >
          {t.auth.reset.requestNew}
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t.auth.reset.title} subtitle={t.auth.reset.subtitle}>
      <ResetPasswordForm t={t} locale={locale} token={token} />
    </AuthShell>
  );
}
