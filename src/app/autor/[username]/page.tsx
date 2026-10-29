import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Package } from "lucide-react";
import { ModCard } from "@/components/catalog/mod-card";
import { EmptyState, SectionHeading } from "@/components/catalog/section-heading";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { getDictionary } from "@/i18n/server";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { getModsByAuthor } from "@/server/catalog";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ username: string }> };

async function load(username: string) {
  if (!/^[a-z0-9._-]{3,24}$/.test(username)) return null;
  return db().user.findUnique({
    where: { username },
    select: { id: true, username: true, name: true, bio: true, role: true, createdAt: true, bannedAt: true },
  });
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { username } = await params;
  const author = await load(username);
  return { title: author ? `${author.name} (@${author.username})` : "404" };
}

export default async function AuthorPage({ params }: Params) {
  const { username } = await params;
  const [{ locale, t }, author] = await Promise.all([getDictionary(), load(username)]);
  if (!author || author.bannedAt) notFound();
  const mods = await getModsByAuthor(locale, author.id);

  return (
    <>
      <SiteHeader />
      <main id="obsah" className="mx-auto max-w-[1320px] space-y-6 px-4 py-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold">{author.name}</h1>
          <p className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted">
            @{author.username}
            {author.role !== "USER" && <span className="led-tag">{t.roles[author.role]}</span>}
            <span>
              {t.author.memberSince} {formatDate(locale, author.createdAt)}
            </span>
          </p>
          {author.bio && <p className="max-w-2xl whitespace-pre-line text-sm">{author.bio}</p>}
        </header>
        <section aria-labelledby="author-mods">
          <SectionHeading id="author-mods" title={t.author.mods} Icon={Package} />
          {mods.length === 0 ? (
            <EmptyState>{t.author.empty}</EmptyState>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {mods.map((mod) => (
                <ModCard key={mod.id} mod={mod} locale={locale} t={t} />
              ))}
            </div>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
