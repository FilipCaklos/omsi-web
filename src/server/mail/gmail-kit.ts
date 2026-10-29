import "server-only";
import { BRAND, emailFrame, escapeHtml, footerLinks } from "./layout";

/** Údaje do podpisu – z parametrov stránky (?meno=…), inak z nastavení portálu. */
export type SignatureInfo = { name: string; role: string; email: string; discord: string | null; base: string };

const clean = (value: string | null, max: number) => (value ?? "").trim().replace(/\s+/g, " ").slice(0, max);

export function signatureInfo(params: URLSearchParams, defaults: { name: string; email: string; discord: string | null; base: string }): SignatureInfo {
  const email = clean(params.get("email"), 120);
  const discord = clean(params.get("discord"), 200);
  return {
    name: clean(params.get("meno"), 80) || defaults.name,
    role: clean(params.get("rola"), 80) || "prevádzkovateľ portálu",
    email: /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(email) ? email : defaults.email,
    discord: /^https:\/\/[^\s<>"]+$/.test(discord) ? discord : defaults.discord,
    base: defaults.base,
  };
}

/** Podpis do Gmailu: značka OD, meno, funkcia, odkazy a pásik. Iba tabuľky a inline štýly. */
export function signatureHtml(info: SignatureInfo): string {
  const host = new URL(info.base).hostname;
  const link = (href: string, label: string) => `<a href="${escapeHtml(href)}" style="color:${BRAND.amberText};text-decoration:none">${escapeHtml(label)}</a>`;
  const links = [link(info.base, host), link(`mailto:${info.email}`, info.email), ...(info.discord ? [link(info.discord, "Discord")] : [])].join(
    ` <span style="color:${BRAND.line}">|</span> `,
  );
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="font-family:Arial,Helvetica,sans-serif;color:${BRAND.text};border-collapse:collapse">
<tr>
<td valign="top" style="padding:0 14px 0 0"><a href="${escapeHtml(info.base)}"><img src="${escapeHtml(info.base)}/brand/mark.png" width="64" height="64" alt="OMSI Depo" style="display:block;border:0;width:64px;height:64px;border-radius:10px"></a></td>
<td valign="top" style="padding:0 0 0 14px;border-left:3px solid ${BRAND.amber}">
<div style="font-size:16px;font-weight:700;line-height:1.3">${escapeHtml(info.name)}</div>
<div style="font-size:13px;color:${BRAND.muted};line-height:1.4">${escapeHtml(info.role)} · <strong style="color:${BRAND.text}">OMSI <span style="color:${BRAND.amberText}">Depo</span></strong></div>
<div style="font-size:12px;color:${BRAND.muted};line-height:1.4;margin:2px 0 6px">CZ/SK modifikácie pre OMSI 2 – mapy, autobusy, repainty, HOF</div>
<div style="font-size:13px;line-height:1.5">${links}</div>
</td>
</tr>
</table>`;
}

/** Šablóna listu: hlavička s logom, miesto na text a podpis – vloží sa do nového emailu v Gmaile. */
export function letterHtml(info: SignatureInfo): string {
  const p = (text: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${BRAND.text}">${text}</p>`;
  const body = [
    p("Dobrý deň, [meno],"),
    p("[Text emailu. Šablónu po vložení do Gmailu prepíš – grafika, logo a podpis zostanú.]"),
    p("[Ďalší odsek.]"),
    p("S pozdravom"),
    `<div style="margin:18px 0 6px">${signatureHtml(info)}</div>`,
  ].join("");
  return emailFrame({ base: info.base, bodyHtml: body, footerHtml: footerLinks(info.base, info.email, "OMSI Depo – komunitný download portál pre OMSI 2. Sťahovanie zadarmo, bez reklám a bez registrácie.") });
}

/**
 * Stránka s náhľadom, formulárom na úpravu údajov a tlačidlom „Kopírovať“ (kopíruje formátovaný obsah,
 * ktorý sa dá vložiť do Gmailu). Skript má nonce z proxy (CSP).
 */
export function kitPage(params: { title: string; intro: string[]; info: SignatureInfo; contentHtml: string; nonce: string; action: string }): string {
  const { info } = params;
  const field = (name: string, label: string, value: string, placeholder = "") =>
    `<label style="display:block;margin:0 0 8px;font-size:13px">${label}<br><input name="${name}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" style="width:100%;max-width:420px;padding:7px 9px;border:1px solid ${BRAND.line};border-radius:5px;font-size:14px"></label>`;
  return `<!doctype html><html lang="sk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(params.title)} · OMSI Depo</title></head>
<body style="margin:0;background:${BRAND.page};font-family:Arial,Helvetica,sans-serif;color:${BRAND.text}">
<div style="max-width:760px;margin:0 auto;padding:24px 16px">
<h1 style="font-size:22px;margin:0 0 10px">${escapeHtml(params.title)}</h1>
${params.intro.map((line) => `<p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:${BRAND.muted}">${line}</p>`).join("")}
<form method="get" action="${params.action}" style="margin:16px 0;padding:14px;background:#fff;border:1px solid ${BRAND.line};border-radius:8px">
${field("meno", "Meno", info.name)}${field("rola", "Funkcia", info.role)}${field("email", "Email", info.email)}${field("discord", "Discord pozvánka (https://discord.gg/…)", info.discord ?? "", "https://discord.gg/…")}
<button type="submit" style="padding:8px 14px;border:1px solid ${BRAND.line};background:#fff;border-radius:5px;font-size:14px;cursor:pointer">Aktualizovať náhľad</button>
</form>
<p><button id="copy" type="button" style="padding:10px 18px;border:0;background:${BRAND.amber};color:#1A1200;font-weight:700;border-radius:6px;font-size:15px;cursor:pointer">Kopírovať do schránky</button>
<span id="done" style="margin-left:10px;font-size:14px;color:#15803D"></span></p>
<div style="padding:20px;background:#fff;border:1px dashed ${BRAND.line};border-radius:8px"><div id="content">${params.contentHtml}</div></div>
</div>
<script nonce="${escapeHtml(params.nonce)}">
document.getElementById("copy").addEventListener("click", async function () {
  var el = document.getElementById("content");
  var done = document.getElementById("done");
  try {
    await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([el.innerHTML], { type: "text/html" }), "text/plain": new Blob([el.innerText], { type: "text/plain" }) })]);
  } catch (e) {
    var range = document.createRange(); range.selectNode(el);
    var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range); document.execCommand("copy"); sel.removeAllRanges();
  }
  done.textContent = "Skopírované – teraz vlož do Gmailu (Ctrl+V).";
});
</script>
</body></html>`;
}
