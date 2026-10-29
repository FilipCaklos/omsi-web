import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { formatDate } from "@/lib/format";
import { contactEmail, env } from "@/lib/env";
import { LEGAL, type LegalDocumentName } from "@/i18n/legal";
import { getDictionary } from "@/i18n/server";

const LEGAL_LINKS: { name: LegalDocumentName; href: string }[] = [
  { name: "terms", href: "/podmienky" },
  { name: "privacy", href: "/ochrana-sukromia" },
  { name: "contact", href: "/kontakt" },
];

function placeholders(): { site: string; operator: string; email: string } {
  const site = new URL(env().APP_URL).hostname;
  return { site, operator: env().LEGAL_OPERATOR_NAME || site, email: contactEmail() };
}

/** Doplní {site} a {operator}; {email} sa vykreslí ako odkaz mailto. */
function RichText({ text }: { text: string }) {
  const { site, operator, email } = placeholders();
  const parts = text.replaceAll("{site}", site).replaceAll("{operator}", operator).split("{email}");
  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {part}
          {index < parts.length - 1 && <a href={`mailto:${email}`}>{email}</a>}
        </Fragment>
      ))}
    </>
  );
}

export async function legalMetadata(name: LegalDocumentName): Promise<Metadata> {
  const { locale } = await getDictionary();
  const doc = LEGAL[locale][name];
  return { title: doc.title, description: doc.description.replaceAll("{site}", placeholders().site) };
}

export async function LegalPage({ name }: { name: LegalDocumentName }) {
  const { locale, t } = await getDictionary();
  const doc = LEGAL[locale][name];

  return (
    <>
      <SiteHeader />
      <main id="obsah" className="mx-auto max-w-3xl px-4 pt-8">
        <nav aria-label={t.footer.legal} className="mb-5 flex flex-wrap gap-1 text-sm">
          {LEGAL_LINKS.map((link) => (
            <Link
              key={link.name}
              href={link.href}
              aria-current={link.name === name ? "page" : undefined}
              className={`rounded-[5px] px-2.5 py-1 ${link.name === name ? "bg-raised text-text" : "text-muted hover:text-text"}`}
            >
              {LEGAL[locale][link.name].title}
            </Link>
          ))}
        </nav>
        <article className="prose-omsi">
          <h1 className="text-2xl font-bold">{doc.title}</h1>
          <p className="text-xs text-muted">
            {t.footer.updated} {formatDate(locale, new Date(doc.updated))}
          </p>
          <p>
            <RichText text={doc.intro} />
          </p>
          {doc.sections.map((section) => (
            <section key={section.heading}>
              <h2>{section.heading}</h2>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph}>
                  <RichText text={paragraph} />
                </p>
              ))}
              {section.items && (
                <ul>
                  {section.items.map((item) => (
                    <li key={item}>
                      <RichText text={item} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
