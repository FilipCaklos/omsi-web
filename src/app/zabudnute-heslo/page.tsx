import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/auth-forms";
import { AuthShell, getCspNonce } from "@/components/auth/auth-shell";
import { getDictionary } from "@/i18n/server";
import { turnstileSiteKey } from "@/server/security/turnstile";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return { title: t.auth.forgot.title, robots: { index: false } };
}

export default async function ForgotPasswordPage() {
  const { locale, t } = await getDictionary();
  return (
    <AuthShell
      title={t.auth.forgot.title}
      subtitle={t.auth.forgot.subtitle}
      footer={
        <Link href="/prihlasenie" className="font-medium text-amber hover:underline">
          {t.auth.forgot.back}
        </Link>
      }
    >
      <ForgotPasswordForm t={t} locale={locale} siteKey={turnstileSiteKey()} nonce={await getCspNonce()} />
    </AuthShell>
  );
}
