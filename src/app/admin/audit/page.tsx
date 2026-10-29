import Link from "next/link";
import { AdminTitle, buttonClass, inputClass, param, type AdminSearchParams } from "@/components/admin/admin-ui";
import { EmptyState } from "@/components/catalog/section-heading";
import type { Prisma } from "@/generated/prisma/client";
import { getDictionary } from "@/i18n/server";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { AUDIT_ACTIONS } from "@/server/audit";
import { requirePagePermission } from "@/server/session";

export const dynamic = "force-dynamic";

const PAGE = 50;

export default async function AuditPage({ searchParams }: { searchParams: AdminSearchParams }) {
  await requirePagePermission("audit:read", "/admin/audit");
  const [{ locale, t }, query] = await Promise.all([getDictionary(), searchParams]);
  const action = param(query, "akcia");
  const actor = (param(query, "kto") ?? "").replace(/^@/, "").toLowerCase().slice(0, 24);
  const before = param(query, "pred");
  const beforeDate = before && !Number.isNaN(Date.parse(before)) ? new Date(before) : null;

  const where: Prisma.AuditLogWhereInput = {
    ...(action && (AUDIT_ACTIONS as readonly string[]).includes(action) ? { action } : {}),
    ...(actor ? { actor: { username: actor } } : {}),
    ...(beforeDate ? { createdAt: { lt: beforeDate } } : {}),
  };
  const entries = await db().auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: PAGE,
    select: { id: true, action: true, targetType: true, targetId: true, metadata: true, ipHash: true, createdAt: true, actor: { select: { username: true } } },
  });
  const a = t.admin.audit;
  const last = entries.at(-1);
  const olderQs = new URLSearchParams({ ...(action ? { akcia: action } : {}), ...(actor ? { kto: actor } : {}), ...(last ? { pred: last.createdAt.toISOString() } : {}) });

  return (
    <>
      <AdminTitle>{t.admin.nav.audit}</AdminTitle>
      <form method="get" className="flex flex-wrap gap-2">
        <select name="akcia" defaultValue={action ?? ""} aria-label={a.action} className={inputClass}>
          <option value="">{a.allActions}</option>
          {AUDIT_ACTIONS.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <input name="kto" defaultValue={actor} placeholder={a.actorFilter} aria-label={a.actorFilter} className={`${inputClass} w-48 font-mono`} />
        <button type="submit" className={buttonClass}>{a.filter}</button>
      </form>
      {entries.length === 0 ? (
        <EmptyState>{a.empty}</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-[5px] border border-line bg-surface">
          <table className="w-full min-w-[720px] text-left font-mono text-xs">
            <thead className="border-b border-line text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">{a.time}</th>
                <th className="px-3 py-2 font-medium">{a.action}</th>
                <th className="px-3 py-2 font-medium">{a.actor}</th>
                <th className="px-3 py-2 font-medium">{a.target}</th>
                <th className="px-3 py-2 font-medium">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {entries.map((entry) => (
                <tr key={entry.id} className="align-top">
                  <td className="whitespace-nowrap px-3 py-1.5 text-muted">{formatDateTime(locale, entry.createdAt)}</td>
                  <td className="px-3 py-1.5 text-amber">{entry.action}</td>
                  <td className="px-3 py-1.5">{entry.actor ? `@${entry.actor.username}` : "—"}</td>
                  <td className="px-3 py-1.5">
                    {entry.targetType ? `${entry.targetType}:${entry.targetId ?? ""}` : "—"}
                    {entry.metadata && Object.keys(entry.metadata as object).length > 0 && (
                      <span className="block max-w-md truncate text-muted" title={JSON.stringify(entry.metadata)}>{JSON.stringify(entry.metadata)}</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-muted" title={entry.ipHash ?? undefined}>{entry.ipHash ? `${entry.ipHash.slice(0, 10)}…` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {entries.length === PAGE && (
        <Link href={`/admin/audit?${olderQs.toString()}`} className={buttonClass}>{a.older} →</Link>
      )}
    </>
  );
}
