import { NextResponse, type NextRequest } from "next/server";

const isDev = process.env.NODE_ENV !== "production";

/**
 * HTTPS-only hlavičky podľa APP_URL za behu (nie pri builde): pri nasadení na http://IP:3000 v lokálnej sieti
 * by upgrade-insecure-requests a HSTS rozbili načítanie skriptov a štýlov.
 */
function servedOverHttps(): boolean {
  return (process.env.APP_URL ?? "").startsWith("https://");
}

function buildCsp(nonce: string): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      "https://challenges.cloudflare.com",
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    // React a next/font vkladajú inline štýly (napr. šírka progress barov)
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", "https://challenges.cloudflare.com", ...(isDev ? ["ws:", "wss:"] : [])],
    "frame-src": ["https://challenges.cloudflare.com", "https://www.youtube-nocookie.com"],
    "media-src": ["'self'"],
    "worker-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'", "https://discord.com"],
    "frame-ancestors": ["'none'"],
  };
  const policy = Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
  return !isDev && servedOverHttps() ? `${policy}; upgrade-insecure-requests` : policy;
}

export function proxy(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  if (!isDev && servedOverHttps()) {
    response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
  return response;
}

export const config = {
  matcher: [
    {
      // Binárne odpovede (sťahovanie, médiá, upload) a statické súbory CSP nepotrebujú
      source: "/((?!api/|_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
