import Link from "next/link";
import { ChevronDown, Download, LogOut, Package, ShieldHalf, UserRound } from "lucide-react";
import { signOutAction } from "@/app/actions/auth";
import type { Dictionary } from "@/i18n/dictionaries/sk";
import { can } from "@/lib/rbac";
import type { CurrentUser } from "@/server/session";

/** Rozbaľovacie menu na <details> – funguje aj bez JavaScriptu. */
export function UserMenu({ user, t }: { user: CurrentUser; t: Dictionary }) {
  return (
    <details className="group relative">
      <summary
        aria-label={t.userMenu.label}
        className="flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-[5px] border border-line px-2.5 text-sm hover:bg-raised [&::-webkit-details-marker]:hidden"
      >
        <UserRound size={16} strokeWidth={1.75} aria-hidden />
        <span className="hidden max-w-[120px] truncate font-medium sm:inline">{user.username}</span>
        <ChevronDown size={14} strokeWidth={2} className="text-muted transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="absolute right-0 top-11 z-50 w-56 overflow-hidden rounded-[5px] border border-line bg-surface shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
        <div className="border-b border-line px-3 py-2">
          <p className="truncate text-sm font-semibold">{user.name}</p>
          <p className="mt-0.5">
            <span className="led-tag">{t.roles[user.role]}</span>
          </p>
        </div>
        <Link href="/ucet" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-raised">
          <UserRound size={15} strokeWidth={1.75} aria-hidden />
          {t.userMenu.account}
        </Link>
        <Link href="/ucet/stiahnute" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-raised">
          <Download size={15} strokeWidth={1.75} aria-hidden />
          {t.userMenu.downloads}
        </Link>
        <Link href="/ucet/mody" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-raised">
          <Package size={15} strokeWidth={1.75} aria-hidden />
          {t.userMenu.myMods}
        </Link>
        {can(user.role, "moderation:queue") && (
          <Link href="/admin" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-raised">
            <ShieldHalf size={15} strokeWidth={1.75} aria-hidden />
            {t.userMenu.admin}
          </Link>
        )}
        <form action={signOutAction} className="border-t border-line">
          <button type="submit" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-raised">
            <LogOut size={15} strokeWidth={1.75} aria-hidden />
            {t.userMenu.signOut}
          </button>
        </form>
      </div>
    </details>
  );
}
