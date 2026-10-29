import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import {
  Bug,
  CalendarClock,
  Newspaper,
  ChevronRight,
  Download,
  ExternalLink,
  Gamepad2,
  History,
  Info,
  Package,
  Pencil,
  Scale,
  Star,
  Users,
} from "lucide-react";
import { BugReportForm, ReviewForm } from "@/components/mod/community-forms";
import { DevlogList } from "@/components/mod/devlog-list";
import { DownloadCenterPanel } from "@/components/mod/download-center";
import { FollowButton } from "@/components/mod/follow-button";
import { PlannedPanel } from "@/components/mod/planned-panel";
import { ReportForm } from "@/components/mod/report-form";
import { Gallery } from "@/components/mod/gallery";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import type { Dictionary } from "@/i18n/dictionaries/sk";
import { getDictionary } from "@/i18n/server";
import { db } from "@/lib/db";
import { formatDate, formatNumber, plural } from "@/lib/format";
import { getModDetail, type ModDetail } from "@/server/mods/detail";
import { getCurrentUser } from "@/server/session";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const { locale } = await getDictionary();
  const user = await getCurrentUser();
  const mod = await getModDetail(slug, user, locale);
  if (!mod) return { title: "404" };
  const image = mod.images[0];
  return {
    title: mod.title,
    description: mod.summary,
    alternates: { canonical: `/mod/${mod.slug}` },
    robots: { index: mod.status === "PUBLISHED", follow: true },
    openGraph: {
      type: "article",
      title: mod.title,
      description: mod.summary,
      url: `/mod/${mod.slug}`,
      images: image ? [{ url: `/api/media/${image.id}?variant=full`, width: image.width, height: image.height }] : undefined,
    },
    twitter: { card: image ? "summary_large_image" : "summary" },
  };
}

function Section({ id, title, Icon, children }: { id: string; title: string; Icon: typeof Info; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-20">
      <h2 id={`${id}-h`} className="mb-3 flex items-center gap-2 border-b border-line pb-2 text-[15px] font-bold uppercase tracking-wide">
        <Icon size={17} strokeWidth={1.75} className="text-amber" aria-hidden />
        {title}
      </h2>
      {children}
    </section>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex" aria-hidden>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={13} strokeWidth={1.75} className={value >= n - 0.25 ? "fill-amber text-amber" : "text-line-strong"} />
      ))}
    </span>
  );
}

function Sidebar({ mod, t }: { mod: ModDetail; t: Dictionary }) {
  const required = mod.dependencies.filter((d) => d.required);
  const recommended = mod.dependencies.filter((d) => !d.required);
  const depItem = (d: ModDetail["dependencies"][number]) => {
    if (d.kind === "STEAM_DLC") {
      return (
        <li key={`dlc-${d.name}`} className="flex items-center gap-2 py-1.5 text-sm">
          <Gamepad2 size={14} strokeWidth={1.75} className="shrink-0 text-muted" aria-hidden />
          <span className="flex-1">{d.name}</span>
          {d.url && (
            <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-xs text-muted hover:text-text">
              {t.modPage.openSteam} <ExternalLink size={11} className="inline" aria-hidden />
            </a>
          )}
        </li>
      );
    }
    if (d.kind === "INTERNAL_MOD") {
      return (
        <li key={`mod-${d.slug}`} className="flex items-center gap-2 py-1.5 text-sm">
          <Package size={14} strokeWidth={1.75} className="shrink-0 text-muted" aria-hidden />
          <Link href={`/mod/${d.slug}`} className="flex-1 hover:text-amber">{d.title}</Link>
        </li>
      );
    }
    return (
      <li key={`ext-${d.url}`} className="flex items-center gap-2 py-1.5 text-sm">
        <ExternalLink size={14} strokeWidth={1.75} className="shrink-0 text-muted" aria-hidden />
        <a href={d.url} target="_blank" rel="nofollow noopener noreferrer" className="flex-1 hover:text-amber">{d.label}</a>
      </li>
    );
  };

  return (
    <div className="space-y-5">
      {required.length > 0 && (
        <div className="rounded-[5px] border border-alert/40 bg-surface p-4">
          <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-alert">{t.modPage.dependencies}</h3>
          <ul className="divide-y divide-line">{required.map(depItem)}</ul>
        </div>
      )}
      {recommended.length > 0 && (
        <div className="rounded-[5px] border border-line bg-surface p-4">
          <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">{t.modPage.recommended}</h3>
          <ul className="divide-y divide-line">{recommended.map(depItem)}</ul>
        </div>
      )}
      {(mod.parameters.length > 0 || mod.vehicleModel || mod.brands.length > 0 || mod.operators.length > 0 || mod.tags.length > 0) && (
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-[5px] border border-line bg-surface p-4 text-sm">
        {mod.parameters.map((p) => (
          <Fragment key={p.label}>
            <dt className="text-muted">{p.label}</dt>
            <dd>{p.href ? <Link href={p.href} className="hover:text-amber">{p.value}</Link> : p.value}</dd>
          </Fragment>
        ))}
        {mod.vehicleModel && (
          <>
            <dt className="text-muted">{t.modPage.vehicleModel}</dt>
            <dd className="font-mono">{mod.vehicleModel}</dd>
          </>
        )}
        {mod.brands.length > 0 && (
          <>
            <dt className="text-muted">{t.modPage.brands}</dt>
            <dd className="flex flex-wrap gap-1">
              {mod.brands.map((b) => (
                <Link key={b.slug} href={`/mody?kategoria=${mod.category.slug}&znacka=${b.slug}`} className="hover:text-amber">{b.name}</Link>
              ))}
            </dd>
          </>
        )}
        {mod.operators.length > 0 && (
          <>
            <dt className="text-muted">{t.modPage.operators}</dt>
            <dd className="flex flex-wrap gap-x-2">
              {mod.operators.map((o) => (
                <Link key={o.slug} href={`/mody?dopravca=${o.slug}`} className="hover:text-amber">{o.name}</Link>
              ))}
            </dd>
          </>
        )}
        {mod.tags.length > 0 && (
          <>
            <dt className="text-muted">{t.modPage.tags}</dt>
            <dd className="flex flex-wrap gap-1">
              {mod.tags.map((tag) => (
                <Link key={tag} href={`/mody?q=${encodeURIComponent(tag)}`} className="rounded-[3px] bg-raised px-1.5 py-0.5 font-mono text-[11px] hover:text-amber">#{tag}</Link>
              ))}
            </dd>
          </>
        )}
      </dl>
      )}
      {mod.credits.length > 0 && (
        <div className="rounded-[5px] border border-line bg-surface p-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
            <Users size={13} aria-hidden /> {t.modPage.credits}
          </h3>
          <ul className="space-y-1 text-sm">
            {mod.credits.map((c, i) => (
              <li key={`${c.name}-${i}`} className="flex justify-between gap-3">
                {c.username ? <Link href={`/autor/${c.username}`} className="hover:text-amber">{c.name}</Link> : <span>{c.name}</span>}
                <span className="text-muted">{t.creditRoles[c.role]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {(mod.licenseTerms.length > 0 || mod.licenseNote) && (
        <div className="rounded-[5px] border border-line bg-surface p-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
            <Scale size={13} aria-hidden /> {t.modPage.license}
          </h3>
          <ul className="list-inside list-disc space-y-0.5 text-sm">
            {mod.licenseTerms.map((term) => <li key={term}>{t.licenseTerms[term]}</li>)}
          </ul>
          {mod.licenseNote && <p className="mt-2 whitespace-pre-line text-xs text-muted">{mod.licenseNote}</p>}
        </div>
      )}
    </div>
  );
}

export default async function ModPage({ params }: Params) {
  const { slug } = await params;
  const { locale, t } = await getDictionary();
  const user = await getCurrentUser();
  const mod = await getModDetail(slug, user, locale);
  if (!mod) notFound();

  const [reviews, ownReview, bugs, versions, devlogs, follow] = await Promise.all([
    db().review.findMany({
      where: { modId: mod.id, hiddenAt: null },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, rating: true, bodyHtml: true, createdAt: true, user: { select: { username: true, name: true } }, version: { select: { version: true } } },
    }),
    user ? db().review.findUnique({ where: { modId_userId: { modId: mod.id, userId: user.id } }, select: { rating: true, body: true } }) : null,
    db().bugReport.findMany({
      where: { modId: mod.id },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 15,
      select: { id: true, title: true, status: true, createdAt: true, reporter: { select: { username: true } }, _count: { select: { comments: true } } },
    }),
    db().modVersion.findMany({ where: { modId: mod.id, status: "PUBLISHED" }, orderBy: { publishedAt: "desc" }, select: { id: true, version: true } }),
    db().devlog.findMany({
      where: { modId: mod.id },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        title: true,
        bodyHtml: true,
        createdAt: true,
        images: { orderBy: { sortOrder: "asc" }, select: { id: true } },
        comments: {
          where: { hiddenAt: null },
          orderBy: { createdAt: "asc" },
          take: 100,
          select: { id: true, bodyHtml: true, createdAt: true, user: { select: { username: true, name: true } } },
        },
      },
    }),
    user ? db().follow.findUnique({ where: { userId_modId: { userId: user.id, modId: mod.id } }, select: { userId: true } }) : null,
  ]);
  const isPlanned = mod.status === "PLANNED" || mod.status === "SCHEDULED";
  const canFollow = user?.id !== mod.author.id && (isPlanned || mod.status === "PUBLISHED");
  const followButton = canFollow && (
    <FollowButton
      modId={mod.id}
      initial={{ following: follow !== null, count: mod.followerCount }}
      signedIn={user !== null}
      signInHref={`/prihlasenie?next=${encodeURIComponent(`/mod/${mod.slug}`)}`}
      labels={{
        follow: isPlanned ? t.planned.follow : t.planned.followPublished,
        unfollow: t.planned.unfollow,
        following: t.planned.following,
        signIn: t.planned.signInToFollow,
        count: plural(locale, mod.followerCount, t.planned.followers),
      }}
    />
  );

  const dialogDeps = mod.dependencies
    .filter((d) => d.required)
    .map((d) =>
      d.kind === "STEAM_DLC"
        ? { kind: d.kind, name: d.name, url: d.url, note: d.note }
        : d.kind === "INTERNAL_MOD"
          ? { kind: d.kind, slug: d.slug, title: d.title, mainFileId: d.mainFileId, note: d.note }
          : { kind: d.kind, label: d.label, url: d.url, note: d.note },
    );
  const banner = t.modPage.statusBanner[mod.status];
  const isPublic = mod.status === "PUBLISHED";

  return (
    <>
      <SiteHeader />
      <main id="obsah" className="mx-auto max-w-[1320px] px-4 pt-5">
        <nav aria-label={t.header.breadcrumb} className="mb-3 flex flex-wrap items-center gap-1 text-xs text-muted">
          <Link href="/mody" className="hover:text-text">{t.header.catalog}</Link>
          <ChevronRight size={12} aria-hidden />
          <Link href={`/mody?kategoria=${mod.category.slug}`} className="hover:text-text">{mod.category.name}</Link>
          {mod.subcategory && (
            <>
              <ChevronRight size={12} aria-hidden />
              <Link href={`/mody?kategoria=${mod.category.slug}&podkategoria=${mod.subcategory.slug}`} className="hover:text-text">{mod.subcategory.name}</Link>
            </>
          )}
        </nav>

        {banner && (
          <p className="mb-4 flex items-center gap-2 rounded-[5px] border border-amber/50 bg-amber-soft px-3 py-2 text-sm">
            <Info size={15} className="shrink-0 text-amber" aria-hidden />
            {banner}
          </p>
        )}

        <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="led-tag">{mod.category.name}</span>
              {mod.currentVersion && <span className="font-mono text-xs text-muted">v{mod.currentVersion.replace(/^v/i, "")}</span>}
            </div>
            <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{mod.title}</h1>
            <p className="max-w-3xl text-muted">{mod.summary}</p>
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span>
                {t.mod.by} <Link href={`/autor/${mod.author.username}`} className="font-semibold hover:text-amber">{mod.author.name}</Link>
              </span>
              {mod.publishedAt && (
                <span className="font-mono text-xs text-muted">
                  {t.modPage.published} {formatDate(locale, mod.publishedAt)}
                  {mod.lastUpdatedAt && mod.lastUpdatedAt.getTime() - mod.publishedAt.getTime() > 60_000 && ` · ${t.modPage.updated} ${formatDate(locale, mod.lastUpdatedAt)}`}
                </span>
              )}
              <span className="inline-flex items-center gap-1 font-mono text-xs text-muted">
                <Download size={12} aria-hidden /> {formatNumber(locale, mod.downloadCount)}
              </span>
              <a href="#recenzie" className="inline-flex items-center gap-1.5 font-mono text-xs text-muted hover:text-text">
                <Stars value={mod.ratingAvg} />
                {mod.ratingCount > 0 ? `${mod.ratingAvg.toFixed(1)} (${mod.ratingCount})` : t.modPage.noRatings}
              </a>
            </p>
          </div>
          {mod.canEdit && (
            <Link href={`/nahrat/${mod.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-[5px] border border-line px-3 text-sm hover:bg-raised">
              <Pencil size={14} aria-hidden /> {t.modPage.edit}
            </Link>
          )}
        </header>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
          {/* Na mobile je panel na stiahnutie hneď pod hlavičkou, na desktope vpravo navrchu */}
          <aside className="space-y-5 lg:order-2">
            {isPlanned ? (
              <Section id="vydanie" title={t.planned.panelTitle} Icon={CalendarClock}>
                <div className="space-y-3">
                  <PlannedPanel mod={mod} t={t} locale={locale} now={Date.now()} />
                  {followButton}
                </div>
              </Section>
            ) : (
              <Section id="subory" title={t.modPage.filesTitle} Icon={Download}>
                <div className="space-y-3">
                  <DownloadCenterPanel center={mod.center} dependencies={dialogDeps} requires4gb={mod.requires4GbPatch} locale={locale} t={t} />
                  {followButton}
                </div>
              </Section>
            )}
            <Sidebar mod={mod} t={t} />
            {user && user.id !== mod.author.id && (
              <ReportForm
                t={t}
                modId={mod.id}
                files={[mod.center.main, ...mod.center.patches, ...mod.center.optional].flatMap((f) => (f ? [{ id: f.id, name: f.displayName }] : []))}
              />
            )}
          </aside>

          <div className="min-w-0 space-y-10 lg:order-1">
            {mod.images.length > 0 && (
              <Gallery images={mod.images} title={mod.title} labels={{ close: t.modPage.close, previous: t.search.previous, next: t.search.next }} />
            )}

            {mod.descriptionHtml && (
              <Section id="popis" title={t.modPage.description} Icon={Info}>
                {/* Obsah je serverovo sanitizovaný (rehype-sanitize allowlist) pri uložení */}
                <div className="prose-omsi" dangerouslySetInnerHTML={{ __html: mod.descriptionHtml }} />
              </Section>
            )}

            {mod.youtubeVideoId && (
              <Section id="video" title={t.modPage.video} Icon={Info}>
                <div className="aspect-video overflow-hidden rounded-[5px] border border-line">
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${mod.youtubeVideoId}`}
                    title={`${mod.title} – ${t.modPage.video}`}
                    loading="lazy"
                    allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
                    referrerPolicy="strict-origin-when-cross-origin"
                    sandbox="allow-scripts allow-same-origin allow-presentation"
                    allowFullScreen
                    className="h-full w-full"
                  />
                </div>
              </Section>
            )}

            {(devlogs.length > 0 || isPlanned) && (
              <Section id="devlog" title={t.planned.devlogs} Icon={Newspaper}>
                <DevlogList
                  devlogs={devlogs}
                  t={t}
                  locale={locale}
                  signedIn={user !== null}
                  canComment={user?.emailVerified === true}
                  noEtaNote={mod.plannedRelease?.noEtaQuestions === true && mod.plannedRelease.releasedAt === null}
                  signInHref={`/prihlasenie?next=${encodeURIComponent(`/mod/${mod.slug}#devlog`)}`}
                />
              </Section>
            )}

            {mod.changelog.length > 0 && (
              <Section id="zmeny" title={t.modPage.changelog} Icon={History}>
                <ol className="space-y-3">
                  {mod.changelog.map((entry) => (
                    <li key={entry.version} className="rounded-[5px] border border-line bg-surface p-3">
                      <p className="mb-1 font-mono text-xs">
                        <span className="font-semibold text-amber">v{entry.version.replace(/^v/i, "")}</span>
                        <span className="ml-2 text-muted">{formatDate(locale, entry.publishedAt)}</span>
                      </p>
                      {entry.html && <div className="prose-omsi text-sm" dangerouslySetInnerHTML={{ __html: entry.html }} />}
                    </li>
                  ))}
                </ol>
              </Section>
            )}

            <Section id="recenzie" title={`${t.reviews.title} (${mod.ratingCount})`} Icon={Star}>
              <div className="space-y-4">
                {isPublic && user && user.id !== mod.author.id && (
                  <details open={ownReview !== null} className="group">
                    <summary className="mb-2 cursor-pointer text-sm font-semibold text-amber">{ownReview ? t.reviews.yours : t.reviews.write}</summary>
                    <ReviewForm t={t} modId={mod.id} initial={ownReview} />
                  </details>
                )}
                {isPublic && !user && (
                  <p className="text-sm text-muted">
                    <Link href={`/prihlasenie?next=${encodeURIComponent(`/mod/${mod.slug}#recenzie`)}`} className="text-amber hover:underline">{t.reviews.signIn}</Link>
                  </p>
                )}
                {reviews.length === 0 ? (
                  <p className="text-sm text-muted">{t.reviews.empty}</p>
                ) : (
                  <ul className="space-y-3">
                    {reviews.map((review) => (
                      <li key={review.id} className="rounded-[5px] border border-line bg-surface p-3">
                        <p className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                          <Stars value={review.rating} />
                          <span className="sr-only">{t.reviews.stars.replace("{n}", String(review.rating))}</span>
                          <Link href={`/autor/${review.user.username}`} className="font-semibold text-text hover:text-amber">{review.user.name}</Link>
                          <span className="font-mono">{formatDate(locale, review.createdAt)}</span>
                          {review.version && <span className="font-mono">{t.reviews.forVersion} v{review.version.version}</span>}
                        </p>
                        <div className="prose-omsi text-sm" dangerouslySetInnerHTML={{ __html: review.bodyHtml }} />
                      </li>
                    ))}
                  </ul>
                )}
                {mod.ratingCount > 0 && (
                  <p className="text-xs text-muted">
                    {formatNumber(locale, mod.ratingCount)} {plural(locale, mod.ratingCount, t.reviews.count)}
                  </p>
                )}
              </div>
            </Section>

            <Section id="chyby" title={t.bugs.title} Icon={Bug}>
              <div className="space-y-4">
                {bugs.length === 0 ? (
                  <p className="text-sm text-muted">{t.bugs.empty}</p>
                ) : (
                  <ul className="divide-y divide-line rounded-[5px] border border-line bg-surface">
                    {bugs.map((bug) => (
                      <li key={bug.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                        <span className={`rounded-[3px] px-1.5 py-0.5 font-mono text-[11px] ${bug.status === "FIXED" ? "bg-signal-soft text-signal" : bug.status === "OPEN" || bug.status === "CONFIRMED" ? "bg-alert-soft text-alert" : "bg-raised text-muted"}`}>
                          {t.bugs.status[bug.status]}
                        </span>
                        <Link href={`/mod/${mod.slug}/chyby/${bug.id}`} className="min-w-0 flex-1 truncate hover:text-amber">{bug.title}</Link>
                        <span className="font-mono text-[11px] text-muted">
                          @{bug.reporter.username} · {formatDate(locale, bug.createdAt)} · {bug._count.comments}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {isPublic && user && (
                  <details>
                    <summary className="mb-2 cursor-pointer text-sm font-semibold text-amber">{t.bugs.new}</summary>
                    <BugReportForm t={t} modId={mod.id} versions={versions} />
                  </details>
                )}
                {isPublic && !user && (
                  <p className="text-sm text-muted">
                    <Link href={`/prihlasenie?next=${encodeURIComponent(`/mod/${mod.slug}#chyby`)}`} className="text-amber hover:underline">{t.bugs.signIn}</Link>
                  </p>
                )}
              </div>
            </Section>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
