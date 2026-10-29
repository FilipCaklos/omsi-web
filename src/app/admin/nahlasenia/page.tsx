import Link from "next/link";
import { resolveReportAction } from "@/app/actions/admin";
import { AdminAlert, AdminTitle, buttonClass, dangerButtonClass, param, primaryButtonClass, type AdminSearchParams } from "@/components/admin/admin-ui";
import { EmptyState } from "@/components/catalog/section-heading";
import { getDictionary } from "@/i18n/server";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { requirePagePermission } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function ReportsPage({ searchParams }: { searchParams: AdminSearchParams }) {
  await requirePagePermission("report:resolve", "/admin/nahlasenia");
  const [{ locale, t }, query] = await Promise.all([getDictionary(), searchParams]);
  const showAll = param(query, "vsetky") === "1";
  const reports = await db().report.findMany({
    where: showAll ? {} : { status: "OPEN" },
    orderBy: { createdAt: showAll ? "desc" : "asc" },
    take: 100,
    include: {
      reporter: { select: { username: true } },
      resolvedBy: { select: { username: true } },
      mod: { select: { title: true, slug: true, status: true } },
      file: { select: { displayName: true } },
      review: { select: { id: true, body: true } },
      comment: { select: { id: true, body: true } },
    },
  });
  const r = t.admin.reports;

  return (
    <>
      <AdminTitle aside={<Link href={showAll ? "/admin/nahlasenia" : "/admin/nahlasenia?vsetky=1"} className={buttonClass}>{showAll ? r.status.OPEN : r.showAll}</Link>}>
        {t.admin.nav.reports}
      </AdminTitle>
      <AdminAlert t={t} params={query} okText={t.admin.queue.decided} />
      {reports.length === 0 ? (
        <EmptyState>{r.empty}</EmptyState>
      ) : (
        <ul className="space-y-3">
          {reports.map((report) => (
            <li key={report.id} className="space-y-2 rounded-[5px] border border-line bg-surface p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="led-tag">{r.reasons[report.reason]}</span>
                <span className="font-mono text-xs text-muted">{r.status[report.status]}</span>
                {report.mod && (
                  <Link href={`/mod/${report.mod.slug}`} className="font-semibold hover:text-amber">
                    {report.mod.title}
                  </Link>
                )}
                {report.file && <span className="text-xs text-muted">· {report.file.displayName}</span>}
              </div>
              <p className="whitespace-pre-line">{report.details}</p>
              {report.review && (
                <blockquote className="border-l-2 border-line pl-3 text-xs text-muted">
                  <span className="font-semibold">{r.review}:</span> {report.review.body.slice(0, 400)}
                </blockquote>
              )}
              {report.comment && (
                <blockquote className="border-l-2 border-line pl-3 text-xs text-muted">
                  <span className="font-semibold">{r.comment}:</span> {report.comment.body.slice(0, 400)}
                </blockquote>
              )}
              <p className="font-mono text-[11px] text-muted">
                {r.reporter}: @{report.reporter.username} · {formatDateTime(locale, report.createdAt)}
                {report.resolvedBy && ` · @${report.resolvedBy.username}${report.resolutionNote ? `: ${report.resolutionNote}` : ""}`}
              </p>
              {report.status === "OPEN" && (
                <form action={resolveReportAction} className="flex flex-wrap items-center gap-2 border-t border-line pt-2">
                  <input type="hidden" name="reportId" value={report.id} />
                  <input type="hidden" name="back" value="/admin/nahlasenia" />
                  <input name="note" placeholder={r.note} maxLength={1000} className="h-9 min-w-56 flex-1 rounded-[5px] border border-line bg-bg px-2 text-sm" />
                  {report.mod && report.mod.status === "PUBLISHED" && (
                    <label className="flex items-center gap-1.5 text-xs">
                      <input type="checkbox" name="hideMod" className="accent-[var(--alert)]" /> {r.hideMod}
                    </label>
                  )}
                  {report.review && (
                    <label className="flex items-center gap-1.5 text-xs">
                      <input type="checkbox" name="hideReview" className="accent-[var(--alert)]" /> {r.hideReview}
                    </label>
                  )}
                  {report.comment && (
                    <label className="flex items-center gap-1.5 text-xs">
                      <input type="checkbox" name="hideComment" className="accent-[var(--alert)]" /> {r.hideComment}
                    </label>
                  )}
                  <button type="submit" name="status" value="RESOLVED" className={primaryButtonClass}>{r.resolve}</button>
                  <button type="submit" name="status" value="DISMISSED" className={dangerButtonClass}>{r.dismiss}</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
