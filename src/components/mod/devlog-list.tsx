import Link from "next/link";
import { Info, MessageSquare } from "lucide-react";
import type { AppLocale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/sk";
import { formatDateTime } from "@/lib/format";
import { DevlogCommentForm } from "./devlog-comment-form";
import { ReportForm } from "./report-form";

export type DevlogView = {
  id: string;
  title: string;
  bodyHtml: string;
  createdAt: Date;
  images: { id: string }[];
  comments: { id: string; bodyHtml: string; createdAt: Date; user: { id: string; username: string; name: string } }[];
};

/** Devlogy s fotkami a diskusiou – zostávajú na stránke aj po vydaní ako história vývoja. */
export function DevlogList({
  devlogs,
  t,
  locale,
  signedIn,
  canComment,
  noEtaNote,
  signInHref,
  modId,
  viewerId,
}: {
  devlogs: DevlogView[];
  t: Dictionary;
  locale: AppLocale;
  signedIn: boolean;
  canComment: boolean;
  noEtaNote: boolean;
  signInHref: string;
  /** Pre tlačidlo Nahlásiť pri komentároch (iba prihlásený, nie pri vlastnom) */
  modId?: string;
  viewerId?: string | null;
}) {
  if (devlogs.length === 0) return <p className="text-sm text-muted">{t.planned.noDevlogs}</p>;
  return (
    <ol className="space-y-5">
      {devlogs.map((devlog) => (
        <li key={devlog.id} id={`devlog-${devlog.id}`} className="scroll-mt-20 rounded-[5px] border border-line bg-surface">
          <header className="border-b border-line px-4 py-2.5">
            <h3 className="font-semibold">{devlog.title}</h3>
            <p className="font-mono text-[11px] text-muted">{formatDateTime(locale, devlog.createdAt)}</p>
          </header>
          <div className="space-y-3 px-4 py-3">
            <div className="prose-omsi text-sm" dangerouslySetInnerHTML={{ __html: devlog.bodyHtml }} />
            {devlog.images.length > 0 && (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {devlog.images.map((image) => (
                  <li key={image.id}>
                    <a href={`/api/media/${image.id}?variant=full`} target="_blank" rel="noopener" className="block overflow-hidden rounded-[3px] border border-line hover:border-amber">
                      <img src={`/api/media/${image.id}?variant=thumb`} alt="" loading="lazy" width={320} height={180} className="aspect-video w-full object-cover" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <details className="rounded-[5px] border border-line bg-bg">
              <summary className="flex cursor-pointer items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted hover:text-text">
                <MessageSquare size={13} aria-hidden /> {t.planned.discussion} ({devlog.comments.length})
              </summary>
              <div className="space-y-3 border-t border-line px-3 py-3">
                {devlog.comments.map((c) => (
                  <div key={c.id} className="text-sm">
                    <p className="font-mono text-[11px] text-muted">
                      <Link href={`/autor/${c.user.username}`} className="font-semibold text-text hover:text-amber">{c.user.name}</Link> · {formatDateTime(locale, c.createdAt)}
                    </p>
                    <div className="prose-omsi" dangerouslySetInnerHTML={{ __html: c.bodyHtml }} />
                    {modId && viewerId && viewerId !== c.user.id && <ReportForm t={t} modId={modId} target={{ kind: "comment", commentId: c.id }} />}
                  </div>
                ))}
                {noEtaNote && (
                  <p className="flex items-start gap-1.5 rounded-[3px] bg-amber-soft px-2 py-1.5 text-xs">
                    <Info size={13} className="mt-0.5 shrink-0 text-amber" aria-hidden /> {t.planned.tbaNote}
                  </p>
                )}
                {signedIn && canComment ? (
                  <DevlogCommentForm t={t} devlogId={devlog.id} />
                ) : !signedIn ? (
                  <Link href={signInHref} className="text-sm text-amber hover:underline">{t.planned.signInToComment}</Link>
                ) : null}
              </div>
            </details>
          </div>
        </li>
      ))}
    </ol>
  );
}
