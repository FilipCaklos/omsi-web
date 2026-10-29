import Link from "next/link";
import { AdminAlert, AdminTitle, type AdminSearchParams } from "@/components/admin/admin-ui";
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

  return (
    <>
      <AdminTitle>{t.admin.nav.queue}</AdminTitle>
      <AdminAlert t={t} params={params} okText={q.decided} />
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
