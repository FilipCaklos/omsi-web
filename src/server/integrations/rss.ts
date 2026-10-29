/** RSS 2.0 – nové mody a verzie pre čítačky, fóra a Discord boty. */

export type FeedItem = {
  title: string;
  url: string;
  guid: string;
  description: string;
  category: string;
  author: string;
  publishedAt: Date;
  imageUrl: string | null;
};

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // Riadiace znaky sú v XML 1.0 neplatné
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
}

export function buildRss(channel: { title: string; url: string; description: string; feedUrl: string }, items: FeedItem[]): string {
  const entries = items
    .map(
      (item) => `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.url)}</link>
      <guid isPermaLink="false">${escapeXml(item.guid)}</guid>
      <description>${escapeXml(item.description)}</description>
      <category>${escapeXml(item.category)}</category>
      <dc:creator>${escapeXml(item.author)}</dc:creator>
      <pubDate>${item.publishedAt.toUTCString()}</pubDate>${item.imageUrl ? `\n      <enclosure url="${escapeXml(item.imageUrl)}" type="image/webp" length="0" />` : ""}
    </item>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${escapeXml(channel.title)}</title>
    <link>${escapeXml(channel.url)}</link>
    <description>${escapeXml(channel.description)}</description>
    <language>sk</language>
    <atom:link href="${escapeXml(channel.feedUrl)}" rel="self" type="application/rss+xml" />
${entries}
  </channel>
</rss>
`;
}
