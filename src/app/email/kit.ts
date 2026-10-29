import { contactEmail, env } from "@/lib/env";
import { kitPage, letterHtml, signatureHtml, signatureInfo } from "@/server/mail/gmail-kit";

type Kind = "signature" | "letter";

/** Spoločná obsluha /email/podpis a /email/list – HTML stránka na skopírovanie do Gmailu. */
export function renderKit(request: Request, kind: Kind): Response {
  const e = env();
  const url = new URL(request.url);
  const info = signatureInfo(url.searchParams, {
    name: e.LEGAL_OPERATOR_NAME.split(",")[0]?.trim() || "OMSI Depo",
    email: contactEmail(),
    discord: e.PUBLIC_DISCORD_URL || null,
    base: e.APP_URL,
  });
  const html = kitPage({
    title: kind === "signature" ? "Podpis do Gmailu" : "Šablóna emailu",
    intro:
      kind === "signature"
        ? [
            "1. Uprav údaje a klikni na Aktualizovať náhľad. 2. Klikni na Kopírovať do schránky.",
            "3. Gmail → ozubené koliesko → Zobraziť všetky nastavenia → Všeobecné → Podpis → Vytvoriť nový → vlož (Ctrl+V) → Uložiť zmeny dole na stránke.",
          ]
        : [
            "1. Uprav údaje podpisu a klikni na Kopírovať do schránky. 2. V Gmaile klikni na Napísať a vlož (Ctrl+V).",
            "3. Prepíš text v hranatých zátvorkách. Ako šablónu ju uložíš cez ⋮ → Šablóny → Uložiť koncept ako šablónu.",
          ],
    info,
    contentHtml: kind === "signature" ? signatureHtml(info) : letterHtml(info),
    nonce: request.headers.get("x-nonce") ?? "",
    action: kind === "signature" ? "/email/podpis" : "/email/list",
  });
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
  });
}
