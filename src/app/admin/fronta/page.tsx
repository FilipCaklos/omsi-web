import Link from "next/link";
import { approveCommunityImageAction, deleteCommunityImageAction } from "@/app/actions/community-images";
import { AdminAlert, AdminTitle, dangerButtonClass, primaryButtonClass, type AdminSearchParams } from "@/components/admin/admin-ui";
import { db } from "@/lib/db";
import { EmptyState } from "@/components/catalog/section-heading";
import { getDictionary } from "@/i18n/server";
import { formatDateTime } from "@/lib/format";
import { getQueue } from "@/server/admin/moderation";
import { requirePagePermission } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function QueuePage({ searchParams }: { searchParams: AdminSearchParams }) {
  await requirePagePermission("moderation:queue", "/admin/fronta");
  const [{ locale, t }, params, items] = await Promise.all([getDictionary(), searchParams, getQueue()]);
  const q = t.admin.queue;
  const label = { NEW_MOD: q.newMod, NEW_VERSION: q.newVersion, PLANNED: q.planned, FILE: q.fileInspection } as const;
  const pendingImages = await db().mediaImage.findMany({
    where: { kind: "COMMUNITY", approvedAt: null },
    orderBy: { createdAt: "asc" },
    take: 60,
    select: { id: true, caption: true, createdAt: true, owner: { select: { username: true } }, mod: { select: { slug: true, title: true } } },
  });

  return (
    <>
      <AdminTitle>{t.admin.nav.queue}</AdminTitle>
      <AdminAlert t={t} params={params} okText={q.decided} />
      {pendingImages.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wide">{t.community.queueTitle} ({pendingImages.length})</h2>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {pendingImages.map((image) => (
              <li key={image.id} className="overflow-hidden rounded-[5px] border border-line bg-surface text-sm">
                <a href={`/api/media/${image.id}?variant=full`} target="_blank" rel="noopener">
                  <img src={`/api/media/${image.id}?variant=thumb`} alt="" width={640} height={360} className="aspect-video w-full object-cover" />
                </a>
                <div className="space-y-2 p-2.5">
                  <p className="text-xs">
                    {image.mod && <Link href={`/mod/${image.mod.slug}`} className="font-semibold hover:text-amber">{image.mod.title}</Link>}
                    {image.caption && <span className="block text-muted">{image.caption}</span>}
                    <span className="block font-mono text-[11px] text-muted">@{image.owner.username} · {formatDateTime(locale, image.createdAt)}</span>
                  </p>
                  <div className="flex gap-2">
                    <form action={approveCommunityImageAction}>
                      <input type="hidden" name="imageId" value={image.id} />
                      <button type="submit" className={primaryButtonClass}>{t.community.approve}</button>
                    </form>
                    <form action={deleteCommunityImageAction}>
                      <input type="hidden" name="imageId" value={image.id} />
                      <button type="submit" className={dangerButtonClass}>{t.community.delete}</button>
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {items.length === 0 ? (
        <EmptyState>{q.empty}</EmptyState>
      ) : (
        <ul className="divide-y divide-line rounded-[5px] border border-line bg-surface">
          {items.map((item) => (
            <li key={item.kind === "FILE" ? item.fileId : `${item.kind}-${item.modId}`} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <span className="led-tag">{label[item.kind]}</span>
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{item.title}</span>
                {(item.kind === "NEW_MOD" || item.kind === "NEW_VERSION") && <span className="ml-2 font-mono text-xs text-muted">v{item.version}</span>}
                {item.kind === "FILE" && <span className="ml-2 text-xs text-muted">{item.fileName}</span>}
                {item.kind === "FILE" && item.vtDetections !== null && (
                  <a href={`https://www.virustotal.com/gui/file/${item.sha256}`} target="_blank" rel="noopener noreferrer" className="ml-2 rounded-[3px] bg-alert-soft px-1.5 py-0.5 text-[11px] font-semibold text-alert hover:underline">
                    VirusTotal: {item.vtDetections}
                  </a>
                )}
                <span className="block font-mono text-[11px] text-muted">
                  @{item.author} · {q.submitted} {formatDateTime(locale, item.at)}
                  {(item.kind === "NEW_MOD" || item.kind === "NEW_VERSION") && ` · ${q.files}: ${item.files}`}
                  {(item.kind === "NEW_MOD" || item.kind === "NEW_VERSION") && item.inspection > 0 && ` · ${item.inspection}× ${t.modPage.awaitingInspection.toLowerCase()}`}
                </span>
              </span>
              <Link href={`/admin/fronta/${item.modId}`} className="inline-flex h-8 items-center rounded-[5px] bg-amber px-3 text-xs font-semibold text-amber-ink hover:bg-amber-hover">
                {q.open}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
