import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignUpForm } from "@/components/auth/auth-forms";
import { AuthShell, OrDivider, getCspNonce } from "@/components/auth/auth-shell";
import { DiscordButton } from "@/components/auth/discord-button";
import { getDictionary } from "@/i18n/server";
import { isDiscordEnabled } from "@/lib/env";
import { turnstileSiteKey } from "@/server/security/turnstile";
import { getCurrentUser } from "@/server/session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return { title: t.auth.signUp.title, robots: { index: false } };
}

export default async function SignUpPage() {
  if (await getCurrentUser()) redirect("/ucet");
  const { locale, t } = await getDictionary();

  return (
    <AuthShell
      title={t.auth.signUp.title}
      subtitle={t.auth.signUp.subtitle}
      footer={
        <>
          {t.auth.signUp.haveAccount}{" "}
          <Link href="/prihlasenie" className="font-medium text-amber hover:underline">
            {t.auth.signIn.submit}
          </Link>
        </>
      }
    >
      {isDiscordEnabled() && (
        <>
          <DiscordButton label={t.auth.discord} next="/ucet" />
          <OrDivider label={t.auth.or} />
        </>
      )}
      <SignUpForm t={t} locale={locale} siteKey={turnstileSiteKey()} nonce={await getCspNonce()} />
    </AuthShell>
  );
}
