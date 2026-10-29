import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { getDictionary } from "@/i18n/server";

export default async function NotFound() {
  const { t } = await getDictionary();
  return (
    <>
      <SiteHeader />
      <main id="obsah" className="mx-auto flex max-w-xl flex-col items-start gap-3 px-4 py-20">
        <span className="led-tag text-sm">404</span>
        <h1 className="text-2xl font-bold">{t.errors.notFoundTitle}</h1>
        <p className="text-muted">{t.errors.notFoundBody}</p>
        <Link
          href="/"
          className="mt-2 inline-flex h-9 items-center rounded-[5px] bg-amber px-3.5 text-sm font-semibold text-amber-ink hover:bg-amber-hover"
        >
          {t.errors.backHome}
        </Link>
      </main>
    </>
  );
}
