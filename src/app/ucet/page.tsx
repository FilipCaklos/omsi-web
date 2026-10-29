import type { Metadata } from "next";
import { LogOut, Monitor, ShieldCheck, TriangleAlert, UserRound } from "lucide-react";
import { revokeOtherSessionsAction, revokeSessionAction } from "@/app/actions/account";
import { signOutAction } from "@/app/actions/auth";
import { ChangePasswordForm, ProfileForm } from "@/components/account/account-forms";
import { FormAlert } from "@/components/forms/fields";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { getDictionary } from "@/i18n/server";
import { db } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { requirePageUser } from "@/server/session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return { title: t.account.title, robots: { index: false } };
}

/** Čitateľný popis zariadenia z User-Agent (bez externých knižníc, len hrubá identifikácia). */
function describeDevice(userAgent: string | null, fallback: string): string {
  if (!userAgent) return fallback;
  const browser =
    /Edg\//.test(userAgent) ? "Edge"
    : /OPR\//.test(userAgent) ? "Opera"
    : /Firefox\//.test(userAgent) ? "Firefox"
    : /Chrome\//.test(userAgent) ? "Chrome"
    : /Safari\//.test(userAgent) ? "Safari"
    : null;
  const os =
    /Windows/.test(userAgent) ? "Windows"
    : /Android/.test(userAgent) ? "Android"
    : /iPhone|iPad/.test(userAgent) ? "iOS"
    : /Mac OS X/.test(userAgent) ? "macOS"
    : /Linux/.test(userAgent) ? "Linux"
    : null;
  return [browser, os].filter(Boolean).join(" · ") || fallback;
}

function Panel({ title, Icon, children }: { title: string; Icon: typeof UserRound; children: React.ReactNode }) {
  return (
    <section className="rounded-[5px] border border-line bg-surface">
      <h2 className="flex items-center gap-2 border-b border-line px-5 py-3 text-sm font-bold uppercase tracking-wide">
        <Icon size={16} strokeWidth={1.75} className="text-amber" aria-hidden />
        {title}
      </h2>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

export default async function AccountPage() {
  const user = await requirePageUser("/ucet");
  const { locale, t } = await getDictionary();

  const [profile, sessions, accounts] = await Promise.all([
    db().user.findUniqueOrThrow({
      where: { id: user.id },
      select: { bio: true, emailNotify: true, createdAt: true },
    }),
    db().session.findMany({
      where: { userId: user.id, expiresAt: { gt: new Date() } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, userAgent: true, updatedAt: true, createdAt: true },
    }),
    db().account.findMany({ where: { userId: user.id }, select: { providerId: true, password: true } }),
  ]);
  const hasPassword = accounts.some((a) => a.providerId === "credential" && a.password);
  const providers = accounts.map((a) => (a.providerId === "credential" ? t.account.passwordLogin : "Discord"));

  return (
    <>
      <SiteHeader />
      <main id="obsah" className="mx-auto max-w-[960px] space-y-6 px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{t.account.title}</h1>
            <p className="font-mono text-sm text-muted">@{user.username}</p>
          </div>
          <form action={signOutAction}>
            <button
              type="submit"
              className="inline-flex h-9 items-center gap-1.5 rounded-[5px] border border-line px-3 text-sm hover:bg-raised"
            >
              <LogOut size={15} strokeWidth={1.75} aria-hidden />
              {t.account.signOut}
            </button>
          </form>
        </div>

        <dl className="grid gap-x-6 gap-y-3 rounded-[5px] border border-line bg-surface px-5 py-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted">{t.account.email}</dt>
            <dd className="mt-0.5 break-all">{user.email}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{t.account.role}</dt>
            <dd className="mt-0.5">
              <span className="led-tag">{t.roles[user.role]}</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{t.account.memberSince}</dt>
            <dd className="mt-0.5 font-mono">{formatDate(locale, profile.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{t.account.linkedAccounts}</dt>
            <dd className="mt-0.5">{providers.join(", ")}</dd>
          </div>
        </dl>

        {!user.emailVerified && (
          <FormAlert tone="error">
            <span className="inline-flex items-center gap-1.5">
              <TriangleAlert size={14} aria-hidden /> {t.auth.errors.EMAIL_NOT_VERIFIED}
            </span>
          </FormAlert>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title={t.account.profile} Icon={UserRound}>
            <ProfileForm
              t={t}
              initial={{
                name: user.name,
                bio: profile.bio ?? "",
                locale: user.locale,
                emailNotify: profile.emailNotify,
              }}
            />
          </Panel>

          <Panel title={t.account.changePassword} Icon={ShieldCheck}>
            {hasPassword ? <ChangePasswordForm t={t} /> : <p className="text-sm text-muted">{t.auth.errors.NO_PASSWORD}</p>}
          </Panel>
        </div>

        <Panel title={t.account.sessions} Icon={Monitor}>
          <ul className="divide-y divide-line">
            {sessions.map((session) => {
              const current = session.id === user.sessionId;
              return (
                <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium">
                      {describeDevice(session.userAgent, t.account.unknownDevice)}
                      {current && <span className="ml-2 rounded-[3px] bg-signal-soft px-1.5 py-0.5 text-[11px] text-signal">{t.account.currentSession}</span>}
                    </p>
                    <p className="font-mono text-[11px] text-muted">
                      {t.account.lastActive}: {formatDateTime(locale, session.updatedAt)}
                    </p>
                  </div>
                  {!current && (
                    <form action={revokeSessionAction}>
                      <input type="hidden" name="sessionId" value={session.id} />
                      <button type="submit" className="h-8 rounded-[5px] border border-line px-2.5 text-xs hover:bg-raised">
                        {t.account.revoke}
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
          {sessions.length > 1 && (
            <form action={revokeOtherSessionsAction} className="mt-3">
              <button
                type="submit"
                className="h-9 rounded-[5px] border border-alert/50 px-3 text-sm text-alert hover:bg-alert-soft"
              >
                {t.account.revokeOthers}
              </button>
            </form>
          )}
        </Panel>
      </main>
      <SiteFooter />
    </>
  );
}
