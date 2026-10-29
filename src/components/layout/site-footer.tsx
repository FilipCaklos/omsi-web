import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { getDictionary } from "@/i18n/server";
import { env } from "@/lib/env";
import { getSiteTotals } from "@/server/catalog";

export async function SiteFooter() {
  const [{ locale, t }, totals] = await Promise.all([getDictionary(), getSiteTotals()]);

  return (
    <footer className="mt-16 border-t border-line bg-surface">
      <div className="mx-auto grid max-w-[1320px] gap-6 px-4 py-8 text-sm text-muted md:grid-cols-[2fr_1fr]">
        <div className="space-y-2">
          <p className="max-w-prose">{t.footer.about}</p>
          <p className="flex items-center gap-1.5">
            <ShieldCheck size={15} strokeWidth={1.75} className="text-signal" aria-hidden />
            {t.footer.integrity}
          </p>
          <nav aria-label={t.footer.legal} className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
            <Link href="/podmienky" className="underline decoration-line underline-offset-2 hover:text-text">{t.footer.terms}</Link>
            <Link href="/ochrana-sukromia" className="underline decoration-line underline-offset-2 hover:text-text">{t.footer.privacy}</Link>
            <Link href="/kontakt" className="underline decoration-line underline-offset-2 hover:text-text">{t.footer.contact}</Link>
            {env().PUBLIC_DISCORD_URL && (
              <a href={env().PUBLIC_DISCORD_URL} target="_blank" rel="noopener noreferrer" className="underline decoration-line underline-offset-2 hover:text-text">Discord</a>
            )}
            <a href="/feed.xml" className="underline decoration-line underline-offset-2 hover:text-text">RSS</a>
          </nav>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 self-start font-mono text-xs md:justify-self-end">
          <dt>{t.footer.mods}</dt>
          <dd className="text-right tabular-nums text-text">{formatNumber(locale, totals.mods)}</dd>
          <dt>{t.footer.files}</dt>
          <dd className="text-right tabular-nums text-text">{formatNumber(locale, totals.files)}</dd>
          <dt>
            <Link href="/api/health" className="underline decoration-line underline-offset-2 hover:text-text">
              {t.footer.status}
            </Link>
          </dt>
          <dd className="text-right">© {new Date().getFullYear()} OMSI Depo</dd>
        </dl>
      </div>
    </footer>
  );
}
