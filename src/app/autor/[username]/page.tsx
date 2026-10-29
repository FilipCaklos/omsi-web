import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Globe, Heart, MessageCircle, Package, PlayCircle } from "lucide-react";
import { ModCard } from "@/components/catalog/mod-card";
import { EmptyState, SectionHeading } from "@/components/catalog/section-heading";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { FollowButton } from "@/components/mod/follow-button";
import { JsonLd } from "@/components/seo/json-ld";
import { env } from "@/lib/env";
import { getCurrentUser } from "@/server/session";
import { getDictionary } from "@/i18n/server";
import { db } from "@/lib/db";
import { formatDate, formatNumber } from "@/lib/format";
import { getModsByAuthor } from "@/server/catalog";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ username: string }> };

async function load(username: string) {
  if (!/^[a-z0-9._-]{3,24}$/.test(username)) return null;
  return db().user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      name: true,
      bio: true,
      role: true,
      createdAt: true,
      bannedAt: true,
      websiteUrl: true,
      youtubeUrl: true,
      discordUrl: true,
      donateUrl: true,
    },
  });
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { username } = await params;
  const author = await load(username);
  if (!author || author.bannedAt) return { title: "404", robots: { index: false } };
  return {
    title: `${author.name} (@${author.username})`,
    description: author.bio?.slice(0, 160) || `${author.name} – OMSI 2 modifikácie na OMSI Depo`,
    alternates: { canonical: `/autor/${author.username}` },
    openGraph: { type: "profile", title: author.name, url: `/autor/${author.username}` },
  };
}

export default async function AuthorPage({ params }: Params) {
  const { username } = await params;
  const [{ locale, t }, author] = await Promise.all([getDictionary(), load(username)]);
  if (!author || author.bannedAt) notFound();
  const viewer = await getCurrentUser();
  const [mods, followers, following, downloads] = await Promise.all([
    getModsByAuthor(locale, author.id),
    db().authorFollow.count({ where: { authorId: author.id } }),
    viewer ? db().authorFollow.findUnique({ where: { followerId_authorId: { followerId: viewer.id, authorId: author.id } }, select: { authorId: true } }) : null,
    db().mod.aggregate({ where: { authorId: author.id, status: "PUBLISHED" }, _sum: { downloadCount: true } }),
  ]);
  const links = [
    { href: author.youtubeUrl, label: "YouTube", Icon: PlayCircle },
    { href: author.discordUrl, label: "Discord", Icon: MessageCircle },
    { href: author.websiteUrl, label: t.account.website, Icon: Globe },
  ].filter((l): l is { href: string; label: string; Icon: typeof Globe } => Boolean(l.href));
  const base = env().APP_URL;

  return (
    <>
      <SiteHeader />
      <main id="obsah" className="mx-auto max-w-[1320px] space-y-6 px-4 py-6">
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "ProfilePage",
            mainEntity: {
              "@type": "Person",
              name: author.name,
              alternateName: author.username,
              url: `${base}/autor/${author.username}`,
              ...(author.bio ? { description: author.bio } : {}),
              sameAs: links.map((l) => l.href),
            },
          }}
        />
        <div className="flex flex-wrap items-start justify-between gap-4">
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
          <p className="font-mono text-xs text-muted">
            {formatNumber(locale, downloads._sum.downloadCount ?? 0)} {t.author.downloads}
          </p>
          {(links.length > 0 || author.donateUrl) && (
            <ul className="flex flex-wrap gap-2 pt-1">
              {links.map(({ href, label, Icon }) => (
                <li key={label}>
                  <a href={href} target="_blank" rel="nofollow ugc noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-[5px] border border-line px-2.5 text-sm hover:bg-raised">
                    <Icon size={14} aria-hidden /> {label}
                  </a>
                </li>
              ))}
              {author.donateUrl && (
                <li>
                  <a href={author.donateUrl} target="_blank" rel="nofollow ugc noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-[5px] bg-amber px-2.5 text-sm font-semibold text-amber-ink hover:bg-amber-hover">
                    <Heart size={14} aria-hidden /> {t.author.support}
                  </a>
                </li>
              )}
            </ul>
          )}
        </header>
        {viewer?.id !== author.id && (
          <div className="w-full sm:w-56">
            <FollowButton
              authorId={author.id}
              initial={{ following: Boolean(following), count: followers }}
              signedIn={viewer !== null}
              signInHref={`/prihlasenie?next=${encodeURIComponent(`/autor/${author.username}`)}`}
              labels={{ follow: t.author.follow, unfollow: t.author.unfollow, following: t.author.following, signIn: t.author.signIn, count: t.author.followers }}
            />
          </div>
        )}
        </div>
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
