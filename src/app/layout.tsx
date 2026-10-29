import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { getDictionary, getTheme } from "@/i18n/server";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-jakarta",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  variable: "--font-jetbrains",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const { locale, t } = await getDictionary();
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return {
    metadataBase: new URL(base),
    title: { default: `${t.meta.siteName} – ${t.meta.tagline}`, template: `%s · ${t.meta.siteName}` },
    description: t.meta.description,
    applicationName: t.meta.siteName,
    alternates: { types: { "application/rss+xml": [{ url: "/feed.xml", title: t.meta.siteName }] } },
    openGraph: {
      type: "website",
      siteName: t.meta.siteName,
      locale: locale === "cs" ? "cs_CZ" : "sk_SK",
      alternateLocale: locale === "cs" ? ["sk_SK"] : ["cs_CZ"],
    },
    keywords: ["OMSI 2", "OMSI mody", "OMSI mapy", "OMSI autobusy", "repainty", "HOF", "Karosa", "SOR", "OMSI 2 Slovensko", "OMSI 2 Česko", "openOMSI"],
    robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
    // Overenie vlastníctva v Google Search Console / Bing Webmaster Tools (meta značka)
    verification: {
      google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
      other: process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : undefined,
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0E1116" },
    { media: "(prefers-color-scheme: light)", color: "#F3F5F8" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [{ locale }, theme] = await Promise.all([getDictionary(), getTheme()]);

  return (
    <html lang={locale} data-theme={theme} className={`${jakarta.variable} ${jetbrains.variable}`}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
