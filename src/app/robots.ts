import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const base = env().APP_URL;
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/ucet", "/nahrat", "/api/", "/prihlasenie", "/registracia", "/obnova-hesla", "/zabudnute-heslo", "/overenie-emailu"] }],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
