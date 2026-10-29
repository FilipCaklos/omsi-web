import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Bug } from "lucide-react";
import { BugCommentForm, BugStatusForm } from "@/components/mod/community-forms";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { getDictionary } from "@/i18n/server";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { can } from "@/lib/rbac";
import { canViewMod } from "@/server/mods/access";
import { getCurrentUser } from "@/server/session";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string; id: string }> };

async function load(slug: string, id: string) {
  if (!/^[a-z0-9]{10,40}$/.test(id)) return null;
  return db().bugReport.findFirst({
    where: { id, mod: { slug } },
    include: {
      reporter: { select: { username: true, name: true } },
      version: { select: { version: true } },
      mod: { select: { id: true, slug: true, title: true, status: true, author: { select: { id: true, role: true } } } },
      comments: { orderBy: { createdAt: "asc" }, include: { user: { select: { id: true, username: true, name: true } } } },
    },
  });
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug, id } = await params;
  const bug = await load(slug, id);
  return { title: bug ? `${bug.title} – ${bug.mod.title}` : "404", robots: { index: false } };
}

export default async function BugPage({ params }: Params) {
  const { slug, id } = await params;
  const [{ locale, t }, user, bug] = await Promise.all([getDictionary(), getCurrentUser(), load(slug, id)]);
  if (!bug || !canViewMod(user, bug.mod)) notFound();
  const canManage = user !== null && (user.id === bug.mod.author.id || can(user.role, "moderation:decide"));

  return (
    <>
      <SiteHeader />
      <main id="obsah" className="mx-auto max-w-[900px] space-y-6 px-4 py-6">
        <Link href={`/mod/${bug.mod.slug}#chyby`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
          <ArrowLeft size={14} aria-hidden /> {t.bugs.back}: {bug.mod.title}
        </Link>

        <header className="space-y-2">
          <p className="flex items-center gap-2 text-xs text-muted">
            <Bug size={14} className="text-amber" aria-hidden />
            <span className="rounded-[3px] bg-raised px-1.5 py-0.5 font-mono">{t.bugs.status[bug.status]}</span>
            {bug.status === "FIXED" && bug.fixedInVersion && <span className="font-mono text-signal">→ v{bug.fixedInVersion}</span>}
          </p>
          <h1 className="text-2xl font-bold">{bug.title}</h1>
          <p className="font-mono text-xs text-muted">
            {t.bugs.reportedBy} @{bug.reporter.username} · {formatDateTime(locale, bug.createdAt)}
            {bug.version && ` · v${bug.version.version}`}
            {bug.omsiVersion && ` · OMSI ${bug.omsiVersion}`}
          </p>
        </header>

        {canManage && <BugStatusForm t={t} bugId={bug.id} status={bug.status} fixedIn={bug.fixedInVersion} />}

        <div className="prose-omsi rounded-[5px] border border-line bg-surface p-4" dangerouslySetInnerHTML={{ __html: bug.descriptionHtml }} />

        {bug.logfile && (
          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide">{t.bugs.logfile}</h2>
            {/* Čistý text v <pre> – React ho escapuje, nič sa neinterpretuje */}
            <pre className="scrollbar-thin max-h-[480px] overflow-auto rounded-[5px] border border-line bg-[#0b0d10] p-3 font-mono text-[12px] leading-relaxed text-[#cfd6e0]">
              {bug.logfile}
            </pre>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide">
            {t.bugs.comments} ({bug.comments.length})
          </h2>
          <ul className="space-y-3">
            {bug.comments.map((comment) => (
              <li key={comment.id} className={`rounded-[5px] border p-3 ${comment.user.id === bug.mod.author.id ? "border-amber/50 bg-amber-soft/30" : "border-line bg-surface"}`}>
                <p className="mb-1 font-mono text-xs text-muted">
                  <Link href={`/autor/${comment.user.username}`} className="font-semibold text-text hover:text-amber">{comment.user.name}</Link>
                  {" · "}
                  {formatDateTime(locale, comment.createdAt)}
                </p>
                <div className="prose-omsi text-sm" dangerouslySetInnerHTML={{ __html: comment.bodyHtml }} />
              </li>
            ))}
          </ul>
          {user && bug.mod.status === "PUBLISHED" ? (
            <BugCommentForm t={t} bugId={bug.id} />
          ) : !user ? (
            <Link href={`/prihlasenie?next=${encodeURIComponent(`/mod/${bug.mod.slug}/chyby/${bug.id}`)}`} className="text-sm text-amber hover:underline">
              {t.auth.signIn.submit}
            </Link>
          ) : null}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
