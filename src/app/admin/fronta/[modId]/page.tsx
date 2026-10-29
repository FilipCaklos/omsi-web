import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, Download, ExternalLink, ShieldAlert, ShieldCheck, Undo2, X } from "lucide-react";
import { moderateFileAction, moderateModAction } from "@/app/actions/admin";
import {
  AdminAlert,
  AdminTitle,
  buttonClass,
  dangerButtonClass,
  primaryButtonClass,
  type AdminSearchParams,
} from "@/components/admin/admin-ui";
import { ArchiveContents } from "@/components/mod/archive-contents";
import type { Dictionary } from "@/i18n/dictionaries/sk";
import { getDictionary } from "@/i18n/server";
import { db } from "@/lib/db";
import { formatBytes, formatDateTime, formatExtension } from "@/lib/format";
import { requirePagePermission } from "@/server/session";

export const dynamic = "force-dynamic";

type Finding = { code: string; path?: string };

function findingsOf(notes: unknown): Finding[] {
  const list = (notes as { findings?: unknown } | null)?.findings;
  return Array.isArray(list) ? (list as Finding[]) : [];
}

export default async function QueueDetailPage({ params, searchParams }: { params: Promise<{ modId: string }>; searchParams: AdminSearchParams }) {
  const { modId } = await params;
  await requirePagePermission("moderation:queue", `/admin/fronta/${modId}`);
  const [{ locale, t }, query] = await Promise.all([getDictionary(), searchParams]);
  if (!/^[a-z0-9]{10,40}$/.test(modId)) notFound();

  const mod = await db().mod.findUnique({
    where: { id: modId },
    include: {
      author: { select: { username: true, name: true, role: true, createdAt: true } },
      category: { select: { nameSk: true, nameCs: true } },
      images: { where: { kind: "SCREENSHOT" }, orderBy: { sortOrder: "asc" }, select: { id: true } },
      plannedRelease: { select: { mode: true, releaseAt: true } },
      versions: {
        where: { OR: [{ status: "PENDING_REVIEW" }, { files: { some: { scanStatus: "REQUIRES_MOD_INSPECTION" } } }] },
        orderBy: { createdAt: "desc" },
        include: { files: { orderBy: { sortOrder: "asc" } } },
      },
      moderation: { orderBy: { createdAt: "desc" }, take: 20, include: { moderator: { select: { username: true } } } },
    },
  });
  if (!mod) notFound();
  const q = t.admin.queue;
  const back = `/admin/fronta/${mod.id}`;
  const pendingVersion = mod.versions.find((v) => v.status === "PENDING_REVIEW");
  const canDecideMod = pendingVersion !== undefined || mod.status === "PENDING_REVIEW";

  return (
    <>
      <AdminTitle
        aside={
          <Link href={`/mod/${mod.slug}`} className={buttonClass}>
            <ExternalLink size={14} aria-hidden /> {q.viewPublic}
          </Link>
        }
      >
        {mod.title}
      </AdminTitle>
      <AdminAlert t={t} params={query} okText={q.decided} />

      <section className="grid gap-4 rounded-[5px] border border-line bg-surface p-4 text-sm md:grid-cols-[1fr_260px]">
        <div className="space-y-2">
          <p className="text-muted">{mod.summary}</p>
          <p className="font-mono text-xs text-muted">
            {q.author}: @{mod.author.username} ({t.roles[mod.author.role]}) · {locale === "cs" ? mod.category.nameCs : mod.category.nameSk} · {t.studio.status[mod.status]}
          </p>
          {pendingVersion?.scheduledAt && <p className="text-xs text-amber">{q.scheduledFor.replace("{date}", formatDateTime(locale, pendingVersion.scheduledAt))}</p>}
          {mod.descriptionHtml && (
            <details className="rounded-[5px] border border-line bg-bg">
              <summary className="cursor-pointer px-3 py-1.5 text-xs text-muted">{t.modPage.description}</summary>
              <div className="prose-omsi border-t border-line p-3" dangerouslySetInnerHTML={{ __html: mod.descriptionHtml }} />
            </details>
          )}
        </div>
        <ul className="grid grid-cols-3 gap-1.5">
          {mod.images.slice(0, 6).map((image) => (
            <li key={image.id}>
              <a href={`/api/media/${image.id}?variant=full`} target="_blank" rel="noopener">
                <img src={`/api/media/${image.id}?variant=thumb`} alt="" className="aspect-video w-full rounded-[3px] border border-line object-cover" />
              </a>
            </li>
          ))}
        </ul>
      </section>

      {mod.versions.map((version) => (
        <section key={version.id} className="rounded-[5px] border border-line bg-surface">
          <h2 className="border-b border-line px-4 py-2 text-sm font-bold uppercase tracking-wide">
            {q.files}: v{version.version} <span className="ml-2 font-mono text-xs font-normal normal-case text-muted">{t.studio.versionStatus[version.status]}</span>
          </h2>
          {version.changelogHtml && <div className="prose-omsi border-b border-line px-4 py-2 text-sm" dangerouslySetInnerHTML={{ __html: version.changelogHtml }} />}
          <ul className="divide-y divide-line">
            {version.files.map((file) => {
              const findings = findingsOf(file.scanNotes);
              return (
                <li key={file.id} className="space-y-2 px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    {file.scanStatus === "CLEAN" ? <ShieldCheck size={16} className="text-signal" aria-hidden /> : <ShieldAlert size={16} className="text-amber" aria-hidden />}
                    <span className="led-tag">{t.modPage.fileKind[file.kind]}</span>
                    <span className="font-semibold">{file.displayName}</span>
                    <span className="font-mono text-xs text-muted">
                      {file.originalFilename} · {formatBytes(locale, file.sizeBytes)} {formatExtension(file.extension)} · {file.archiveEntryCount} {t.modPage.entries}
                    </span>
                  </div>
                  <code className="block break-all font-mono text-[11px] text-muted">SHA-256 {file.sha256}</code>
                  <div>
                    <p className="text-xs font-semibold">{q.findings}</p>
                    {findings.length === 0 ? (
                      <p className="text-xs text-muted">{q.noFindings}</p>
                    ) : (
                      <ul className="list-inside list-disc text-xs text-amber">
                        {findings.map((f, i) => (
                          <li key={i}>
                            {t.findings[f.code as keyof Dictionary["findings"]] ?? f.code}
                            {f.path && <code className="ml-1 font-mono text-muted">{f.path}</code>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {file.archiveEntryCount > 0 && file.scanStatus !== "REJECTED" && (
                    <ArchiveContents
                      fileId={file.id}
                      labels={{ show: t.modPage.showContents, installRoot: t.modPage.installRoot, installPrefix: t.modPage.installPrefix, installUnknown: t.modPage.installUnknown, truncated: t.modPage.truncated }}
                    />
                  )}
                  <div className="flex flex-wrap items-end gap-2">
                    {file.scanStatus !== "REJECTED" && (
                      <form method="post" action="/api/download">
                        <input type="hidden" name="fileId" value={file.id} />
                        <button type="submit" className={buttonClass}>
                          <Download size={14} aria-hidden /> {q.downloadForReview}
                        </button>
                      </form>
                    )}
                    {file.scanStatus === "REQUIRES_MOD_INSPECTION" && (
                      <form action={moderateFileAction} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="fileId" value={file.id} />
                        <input type="hidden" name="back" value={back} />
                        <input name="comment" placeholder={q.comment} maxLength={2000} className="h-9 w-56 rounded-[5px] border border-line bg-bg px-2 text-sm" />
                        <button type="submit" name="decision" value="allow" className={primaryButtonClass}>
                          <Check size={14} aria-hidden /> {q.approveFile}
                        </button>
                        <button type="submit" name="decision" value="block" className={dangerButtonClass}>
                          <X size={14} aria-hidden /> {q.rejectFile}
                        </button>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {canDecideMod && (
        <form action={moderateModAction} className="space-y-3 rounded-[5px] border border-amber/50 bg-surface p-4">
          <input type="hidden" name="modId" value={mod.id} />
          <input type="hidden" name="back" value={back} />
          <label className="block space-y-1">
            <span className="text-sm font-medium">{q.comment}</span>
            <textarea name="comment" rows={3} maxLength={2000} className="w-full rounded-[5px] border border-line bg-bg px-3 py-2 text-sm" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" name="decision" value="approve" className={primaryButtonClass}>
              <Check size={14} aria-hidden /> {pendingVersion ? q.approve : q.approvePlanned}
            </button>
            <button type="submit" name="decision" value="changes" className={buttonClass}>
              <Undo2 size={14} aria-hidden /> {q.requestChanges}
            </button>
            <button type="submit" name="decision" value="reject" className={dangerButtonClass}>
              <X size={14} aria-hidden /> {q.reject}
            </button>
          </div>
        </form>
      )}

      {mod.moderation.length > 0 && (
        <section className="rounded-[5px] border border-line bg-surface">
          <h2 className="border-b border-line px-4 py-2 text-sm font-bold uppercase tracking-wide">{q.history}</h2>
          <ul className="divide-y divide-line text-sm">
            {mod.moderation.map((entry) => (
              <li key={entry.id} className="px-4 py-2">
                <p className="font-mono text-[11px] text-muted">
                  {formatDateTime(locale, entry.createdAt)} · @{entry.moderator.username} · <span className="text-text">{q.decision[entry.decision]}</span>
                </p>
                {entry.comment && <p className="whitespace-pre-line">{entry.comment}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
