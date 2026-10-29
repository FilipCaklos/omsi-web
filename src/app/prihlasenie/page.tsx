import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/auth/auth-forms";
import { AuthShell, OrDivider, getCspNonce } from "@/components/auth/auth-shell";
import { DiscordButton } from "@/components/auth/discord-button";
import { FormAlert } from "@/components/forms/fields";
import { getDictionary } from "@/i18n/server";
import { isDiscordEnabled } from "@/lib/env";
import { formatError, isAuthErrorCode } from "@/lib/form-state";
import { safeRedirectPath } from "@/lib/validation/auth";
import { turnstileSiteKey } from "@/server/security/turnstile";
import { getCurrentUser } from "@/server/session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return { title: t.auth.signIn.title, robots: { index: false } };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SignInPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = safeRedirectPath(typeof params.next === "string" ? params.next : undefined, "/");
  if (await getCurrentUser()) redirect(next);

  const { locale, t } = await getDictionary();
  const rawError = typeof params.error === "string" ? params.error : null;
  // Chyby z OAuth callbacku Better Auth majú vlastné kódy – mapujeme ich na naše správy
  const errorCode = rawError
    ? isAuthErrorCode(rawError, t)
      ? rawError
      : /banned/i.test(rawError)
        ? "ACCOUNT_BANNED"
        : "OAUTH_FAILED"
    : null;

  return (
    <AuthShell
      title={t.auth.signIn.title}
      subtitle={t.auth.signIn.subtitle}
      footer={
        <>
          {t.auth.signIn.noAccount}{" "}
          <Link href="/registracia" className="font-medium text-amber hover:underline">
            {t.auth.signIn.register}
          </Link>
        </>
      }
    >
      {errorCode && <FormAlert tone="error">{formatError(t, errorCode)}</FormAlert>}
      {isDiscordEnabled() && (
        <>
          <DiscordButton label={t.auth.discord} next={next} />
          <OrDivider label={t.auth.or} />
        </>
      )}
      <SignInForm t={t} locale={locale} siteKey={turnstileSiteKey()} nonce={await getCspNonce()} next={next} />
    </AuthShell>
  );
}
