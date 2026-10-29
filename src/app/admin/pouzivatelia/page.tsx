import Link from "next/link";
import { Search } from "lucide-react";
import { banUserAction, setUserRoleAction } from "@/app/actions/admin";
import { AdminAlert, AdminTitle, buttonClass, dangerButtonClass, inputClass, param, type AdminSearchParams } from "@/components/admin/admin-ui";
import { getDictionary } from "@/i18n/server";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { canAssignRole, canBan, type AppRole } from "@/lib/rbac";
import { requirePagePermission } from "@/server/session";

export const dynamic = "force-dynamic";

const ROLES = ["USER", "VERIFIED_CREATOR", "MODERATOR", "ADMIN"] as const;

export default async function AdminUsersPage({ searchParams }: { searchParams: AdminSearchParams }) {
  const actor = await requirePagePermission("user:ban", "/admin/pouzivatelia");
  const [{ locale, t }, query] = await Promise.all([getDictionary(), searchParams]);
  const q = (param(query, "q") ?? "").trim().toLowerCase().slice(0, 60);
  const users = await db().user.findMany({
    where: q ? { OR: [{ username: { contains: q } }, { email: { contains: q } }, { name: { contains: q, mode: "insensitive" } }] } : {},
    orderBy: { createdAt: "desc" },
    take: 60,
    select: {
      id: true, username: true, name: true, email: true, role: true, emailVerified: true, createdAt: true, lastLoginAt: true,
      bannedAt: true, bannedUntil: true, banReason: true, _count: { select: { mods: true } },
    },
  });
  const u = t.admin.users;
  const back = q ? `/admin/pouzivatelia?q=${encodeURIComponent(q)}` : "/admin/pouzivatelia";

  return (
    <>
      <AdminTitle>{t.admin.nav.users}</AdminTitle>
      <AdminAlert t={t} params={query} okText={u.saved} />
      <form method="get" className="flex gap-2">
        <input name="q" defaultValue={q} placeholder={u.search} aria-label={u.search} className={`${inputClass} flex-1`} />
        <button type="submit" className={buttonClass}><Search size={14} aria-hidden /></button>
      </form>
      <ul className="space-y-2">
        {users.map((user) => {
          const role = user.role as Exclude<AppRole, "GUEST">;
          const banned = user.bannedAt !== null && (user.bannedUntil === null || user.bannedUntil.getTime() > Date.now());
          const assignable = ROLES.filter((r) => r !== role && canAssignRole(actor, user.id, role, r));
          return (
            <li key={user.id} className={`space-y-2 rounded-[5px] border bg-surface p-3 text-sm ${banned ? "border-alert/50" : "border-line"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/autor/${user.username}`} className="font-semibold hover:text-amber">{user.name}</Link>
                <span className="font-mono text-xs text-muted">@{user.username} · {user.email}</span>
                <span className="led-tag">{t.roles[role]}</span>
                {!user.emailVerified && <span className="text-xs text-alert">{t.account.notVerified}</span>}
                {banned && (
                  <span className="text-xs font-semibold text-alert">
                    {u.banned}
                    {user.bannedUntil && ` ${u.bannedUntil.replace("{date}", formatDate(locale, user.bannedUntil))}`}
                    {user.banReason && ` – ${user.banReason}`}
                  </span>
                )}
              </div>
              <p className="font-mono text-[11px] text-muted">
                {t.account.memberSince} {formatDate(locale, user.createdAt)} · {u.lastLogin}: {user.lastLoginAt ? formatDate(locale, user.lastLoginAt) : u.never} · {u.mods}: {user._count.mods}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                {assignable.length > 0 && (
                  <form action={setUserRoleAction} className="flex items-center gap-1.5">
                    <input type="hidden" name="userId" value={user.id} />
                    <input type="hidden" name="back" value={back} />
                    <select name="role" aria-label={u.role} className={inputClass} defaultValue={assignable[0]}>
                      {assignable.map((r) => <option key={r} value={r}>{t.roles[r]}</option>)}
                    </select>
                    <button type="submit" className={buttonClass}>{u.changeRole}</button>
                  </form>
                )}
                {canBan(actor, { id: user.id, role }) &&
                  (banned ? (
                    <form action={banUserAction}>
                      <input type="hidden" name="userId" value={user.id} />
                      <input type="hidden" name="back" value={back} />
                      <input type="hidden" name="unban" value="1" />
                      <button type="submit" className={buttonClass}>{u.unban}</button>
                    </form>
                  ) : (
                    <form action={banUserAction} className="flex flex-wrap items-center gap-1.5">
                      <input type="hidden" name="userId" value={user.id} />
                      <input type="hidden" name="back" value={back} />
                      <input name="reason" placeholder={u.banReason} aria-label={u.banReason} maxLength={500} className={`${inputClass} w-48`} />
                      <input name="days" type="number" min={1} max={3650} placeholder={u.banDays} aria-label={u.banDays} title={u.banDays} className={`${inputClass} w-24 font-mono`} />
                      <button type="submit" className={dangerButtonClass}>{u.ban}</button>
                    </form>
                  ))}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
