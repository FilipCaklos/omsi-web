import Link from "next/link";
import { Bell, CalendarClock, LogIn, Upload } from "lucide-react";
import { getDictionary, getTheme } from "@/i18n/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/server/session";
import { LocaleSwitch } from "./locale-switch";
import { SearchBox } from "./search-box";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

function Wordmark() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="OMSI Depo">
      {/* Linkový štítok v štýle LED panelu */}
      <span className="led-tag text-[13px] leading-[22px]">OD</span>
      <span className="text-[15px] font-bold tracking-tight">
        OMSI <span className="text-muted">Depo</span>
      </span>
    </Link>
  );
}

export async function SiteHeader({ query = "" }: { query?: string }) {
  const [{ locale, t }, theme, user] = await Promise.all([getDictionary(), getTheme(), getCurrentUser()]);
  const unread = user ? await db().notification.count({ where: { userId: user.id, readAt: null } }) : 0;

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur-[2px]">
      <a
        href="#obsah"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-amber focus:px-3 focus:py-1.5 focus:text-amber-ink"
      >
        {t.header.skipToContent}
      </a>
      <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-4 gap-y-2.5 px-4 py-2.5 md:flex-nowrap">
        <Wordmark />

        <SearchBox
          initial={query}
          labels={{
            label: t.header.searchLabel,
            placeholder: t.header.searchPlaceholder,
            submit: t.header.searchSubmit,
            searchAll: t.catalog.searchAll,
          }}
        />

        <nav className="ml-auto flex items-center gap-2" aria-label={t.header.mainNav}>
          <Link
            href="/pripravovane"
            className="hidden h-9 items-center gap-1.5 whitespace-nowrap rounded-[5px] px-2.5 text-sm text-muted hover:bg-raised hover:text-text xl:flex"
          >
            <CalendarClock size={16} strokeWidth={1.75} aria-hidden />
            {t.header.upcoming}
          </Link>
          <LocaleSwitch current={locale} label={t.header.languageLabel} />
          <ThemeToggle initial={theme} labelToDark={t.header.themeToDark} labelToLight={t.header.themeToLight} />
          {user && (
            <Link
              href="/ucet/upozornenia"
              aria-label={`${t.notifications.bell}${unread > 0 ? ` (${unread})` : ""}`}
              className="relative grid size-9 place-items-center rounded-[5px] border border-line text-muted hover:bg-raised hover:text-text"
            >
              <Bell size={17} strokeWidth={1.75} aria-hidden />
              {unread > 0 && (
                <span className="absolute -right-1.5 -top-1.5 min-w-[18px] rounded-full bg-amber px-1 text-center font-mono text-[10px] font-bold leading-[18px] text-amber-ink">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
          )}
          {user ? (
            <UserMenu user={user} t={t} />
          ) : (
            <Link
              href="/prihlasenie"
              className="flex h-9 items-center gap-1.5 rounded-[5px] border border-line px-3 text-sm font-medium hover:bg-raised"
            >
              <LogIn size={16} strokeWidth={1.75} aria-hidden />
              <span className="hidden whitespace-nowrap md:inline">{t.header.signIn}</span>
            </Link>
          )}
          <Link
            href="/nahrat"
            className="flex h-9 items-center gap-1.5 rounded-[5px] bg-amber px-3 text-sm font-semibold text-amber-ink hover:bg-amber-hover"
          >
            <Upload size={16} strokeWidth={2} aria-hidden />
            <span className="hidden whitespace-nowrap lg:inline">{t.header.upload}</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
