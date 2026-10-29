/**
 * Štruktúrované dáta schema.org pre vyhľadávače (Google rich results).
 * `<` sa nahrádza unicode escapom, aby text z databázy nemohol ukončiť <script> (XSS).
 */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

/** Absolútna URL z cesty (schema.org vyžaduje plné adresy). */
export function absoluteUrl(base: string, path: string): string {
  return new URL(path, `${base}/`).toString();
}

export type BreadcrumbItem = { name: string; path: string };

export function breadcrumbList(base: string, items: BreadcrumbItem[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(base, item.path),
    })),
  };
}
