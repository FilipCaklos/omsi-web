/**
 * Grafický rámec emailov OMSI Depo – automatické emaily portálu aj šablóna listu pre Gmail.
 * Tabuľkové HTML s inline štýlmi (Gmail, Outlook, Apple Mail); logo je PNG z /brand na verejnej adrese webu.
 */

export const BRAND = {
  amber: "#F59E0B",
  amberText: "#B36B00",
  ink: "#0B0D10",
  text: "#11151C",
  muted: "#5B6575",
  line: "#D5DCE6",
  page: "#F3F5F8",
} as const;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Pásik pod hlavičkou – motív z označníka zastávky. */
function stripe(): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td height="4" style="height:4px;line-height:4px;font-size:0;background:${BRAND.amber}" width="62%">&nbsp;</td>
<td height="4" style="height:4px;line-height:4px;font-size:0;background:#F8C56A" width="25%">&nbsp;</td>
<td height="4" style="height:4px;line-height:4px;font-size:0;background:#FBE2B4" width="13%">&nbsp;</td>
</tr></table>`;
}

export type EmailFrame = {
  base: string;
  /** Krátky text, ktorý klient zobrazí v zozname správ vedľa predmetu */
  preheader?: string;
  bodyHtml: string;
  footerHtml: string;
};

/** Celá správa: tmavá hlavička s logom, pásik, biele telo, pätička. */
export function emailFrame({ base, preheader, bodyHtml, footerHtml }: EmailFrame): string {
  return `<!doctype html><html lang="sk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>OMSI Depo</title></head>
<body style="margin:0;padding:0;background:${BRAND.page};font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.page}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#FFFFFF;border:1px solid ${BRAND.line};border-radius:8px;overflow:hidden">
<tr><td style="background:${BRAND.ink};padding:18px 28px">
<a href="${escapeHtml(base)}" style="text-decoration:none"><img src="${escapeHtml(base)}/brand/logo-on-dark.png" width="210" height="60" alt="OMSI Depo – CZ/SK modifikácie pre OMSI 2" style="display:block;border:0;width:210px;height:60px;color:#FFFFFF;font-size:20px;font-weight:700"></a>
</td></tr>
<tr><td style="padding:0">${stripe()}</td></tr>
<tr><td style="padding:28px 28px 8px;color:${BRAND.text}">${bodyHtml}</td></tr>
<tr><td style="padding:18px 28px 24px;border-top:1px solid ${BRAND.line};background:#FAFBFC;font-size:12px;line-height:1.6;color:${BRAND.muted}">${footerHtml}</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export function paragraph(text: string): string {
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${BRAND.text}">${escapeHtml(text)}</p>`;
}

export function heading(text: string): string {
  return `<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${BRAND.text}">${escapeHtml(text)}</h1>`;
}

export function button(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 10px"><tr><td style="background:${BRAND.amber};border-radius:6px">
<a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:700;color:#1A1200;text-decoration:none">${escapeHtml(label)}</a>
</td></tr></table>`;
}

export function footerLinks(base: string, contactEmail: string, note: string, cs = false): string {
  return `<p style="margin:0 0 6px">${escapeHtml(note)}</p>
<p style="margin:0"><a href="${escapeHtml(base)}" style="color:${BRAND.amberText};text-decoration:none;font-weight:700">${escapeHtml(new URL(base).hostname)}</a>
&nbsp;·&nbsp;<a href="${escapeHtml(base)}/mody" style="color:${BRAND.muted}">${cs ? "Katalog" : "Katalóg"}</a>
&nbsp;·&nbsp;<a href="${escapeHtml(base)}/mapa" style="color:${BRAND.muted}">${cs ? "Mapa map" : "Mapa máp"}</a>
&nbsp;·&nbsp;<a href="mailto:${escapeHtml(contactEmail)}" style="color:${BRAND.muted}">${escapeHtml(contactEmail)}</a></p>`;
}
