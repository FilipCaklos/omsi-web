import type { AppLocale } from "@/i18n/config";
import type { MailMessage } from "./transport";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type Block = {
  heading: string;
  paragraphs: string[];
  items?: { text: string; url: string }[];
  action?: { label: string; url: string };
  footnote: string;
};

/** Jednoduché tabuľkové HTML – funguje aj v starších klientoch, bez externých obrázkov a skriptov. */
function render(to: string, subject: string, block: Block): MailMessage {
  const paragraphsHtml = block.paragraphs
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#11151c">${escapeHtml(p)}</p>`)
    .join("");
  const itemsHtml = block.items?.length
    ? `<ul style="margin:0 0 14px;padding-left:18px">${block.items
        .map((i) => `<li style="margin:0 0 8px;font-size:14px;line-height:1.5"><a href="${escapeHtml(i.url)}" style="color:#b36b00">${escapeHtml(i.text)}</a></li>`)
        .join("")}</ul>`
    : "";
  const actionHtml = block.action
    ? `<p style="margin:22px 0"><a href="${escapeHtml(block.action.url)}" style="display:inline-block;background:#e59500;color:#1a1200;font-weight:700;text-decoration:none;padding:11px 18px;border-radius:5px;font-size:15px">${escapeHtml(block.action.label)}</a></p>
       <p style="margin:0 0 14px;font-size:12px;color:#5b6575;word-break:break-all">${escapeHtml(block.action.url)}</p>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f3f5f8;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f8;padding:24px 0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #d5dce6;border-radius:5px">
<tr><td style="padding:14px 24px;border-bottom:1px solid #d5dce6"><span style="font-family:Consolas,monospace;font-weight:700;color:#f59e0b;background:#0b0d10;padding:2px 7px;border-radius:3px">OD</span>
<span style="font-weight:700;color:#11151c;margin-left:6px">OMSI Depo</span></td></tr>
<tr><td style="padding:24px">
<h1 style="margin:0 0 16px;font-size:20px;color:#11151c">${escapeHtml(block.heading)}</h1>
${paragraphsHtml}${itemsHtml}${actionHtml}
<p style="margin:20px 0 0;font-size:12px;color:#5b6575">${escapeHtml(block.footnote)}</p>
</td></tr></table></td></tr></table></body></html>`;
  const text = [
    block.heading,
    "",
    ...block.paragraphs,
    ...(block.items ?? []).map((i) => `• ${i.text}
  ${i.url}`),
    ...(block.action ? ["", `${block.action.label}: ${block.action.url}`] : []),
    "",
    block.footnote,
    "",
    "— OMSI Depo",
  ].join("\n");
  return { to, subject, text, html };
}

export function verifyEmailMail(locale: AppLocale, to: string, name: string, url: string): MailMessage {
  if (locale === "cs") {
    return render(to, "Potvrď svůj e-mail – OMSI Depo", {
      heading: `Ahoj ${name},`,
      paragraphs: [
        "díky za registraci na OMSI Depo. Pro aktivaci účtu potvrď svou e-mailovou adresu.",
        "Odkaz platí 24 hodin.",
      ],
      action: { label: "Potvrdit e-mail", url },
      footnote: "Pokud jsi se neregistroval(a), tento e-mail ignoruj – účet bez potvrzení nebude aktivní.",
    });
  }
  return render(to, "Potvrď svoj email – OMSI Depo", {
    heading: `Ahoj ${name},`,
    paragraphs: [
      "ďakujeme za registráciu na OMSI Depo. Na aktiváciu účtu potvrď svoju emailovú adresu.",
      "Odkaz platí 24 hodín.",
    ],
    action: { label: "Potvrdiť email", url },
    footnote: "Ak si sa neregistroval(a), tento email ignoruj – účet bez potvrdenia nebude aktívny.",
  });
}

export function resetPasswordMail(locale: AppLocale, to: string, name: string, url: string): MailMessage {
  if (locale === "cs") {
    return render(to, "Obnovení hesla – OMSI Depo", {
      heading: `Ahoj ${name},`,
      paragraphs: [
        "někdo (snad ty) požádal o obnovení hesla k tvému účtu na OMSI Depo.",
        "Odkaz platí 1 hodinu a lze ho použít jen jednou. Po změně hesla budeš odhlášen(a) ze všech zařízení.",
      ],
      action: { label: "Nastavit nové heslo", url },
      footnote: "Pokud jsi o obnovení nežádal(a), tento e-mail ignoruj. Tvé heslo zůstává beze změny.",
    });
  }
  return render(to, "Obnova hesla – OMSI Depo", {
    heading: `Ahoj ${name},`,
    paragraphs: [
      "niekto (dúfame, že ty) požiadal o obnovu hesla k tvojmu účtu na OMSI Depo.",
      "Odkaz platí 1 hodinu a dá sa použiť iba raz. Po zmene hesla budeš odhlásený(á) zo všetkých zariadení.",
    ],
    action: { label: "Nastaviť nové heslo", url },
    footnote: "Ak si o obnovu nežiadal(a), tento email ignoruj. Tvoje heslo zostáva nezmenené.",
  });
}

export function existingAccountMail(locale: AppLocale, to: string, name: string, loginUrl: string): MailMessage {
  if (locale === "cs") {
    return render(to, "Pokus o registraci – OMSI Depo", {
      heading: `Ahoj ${name},`,
      paragraphs: [
        "někdo se právě pokusil zaregistrovat nový účet s tvou e-mailovou adresou. Účet s touto adresou už existuje.",
        "Pokud jsi to byl(a) ty, stačí se přihlásit. Zapomenuté heslo si můžeš obnovit na přihlašovací stránce.",
      ],
      action: { label: "Přihlásit se", url: loginUrl },
      footnote: "Pokud jsi to nebyl(a) ty, nic nemusíš dělat.",
    });
  }
  return render(to, "Pokus o registráciu – OMSI Depo", {
    heading: `Ahoj ${name},`,
    paragraphs: [
      "niekto sa práve pokúsil zaregistrovať nový účet s tvojou emailovou adresou. Účet s touto adresou už existuje.",
      "Ak si to bol(a) ty, stačí sa prihlásiť. Zabudnuté heslo si môžeš obnoviť na prihlasovacej stránke.",
    ],
    action: { label: "Prihlásiť sa", url: loginUrl },
    footnote: "Ak si to nebol(a) ty, nemusíš nič robiť.",
  });
}

export function passwordChangedMail(locale: AppLocale, to: string, name: string, resetUrl: string): MailMessage {
  if (locale === "cs") {
    return render(to, "Heslo bylo změněno – OMSI Depo", {
      heading: `Ahoj ${name},`,
      paragraphs: [
        "heslo k tvému účtu na OMSI Depo bylo právě změněno a ostatní přihlášená zařízení byla odhlášena.",
        "Pokud jsi heslo neměnil(a) ty, okamžitě si ho obnov.",
      ],
      action: { label: "Obnovit heslo", url: resetUrl },
      footnote: "Tento e-mail je bezpečnostní upozornění a nelze ho odhlásit.",
    });
  }
  return render(to, "Heslo bolo zmenené – OMSI Depo", {
    heading: `Ahoj ${name},`,
    paragraphs: [
      "heslo k tvojmu účtu na OMSI Depo bolo práve zmenené a ostatné prihlásené zariadenia boli odhlásené.",
      "Ak si heslo nemenil(a) ty, okamžite si ho obnov.",
    ],
    action: { label: "Obnoviť heslo", url: resetUrl },
    footnote: "Tento email je bezpečnostné upozornenie a nedá sa odhlásiť.",
  });
}

export function notificationDigestMail(
  locale: AppLocale,
  to: string,
  name: string,
  texts: { subject: string; intro: string; footer: string; open: string },
  items: { text: string; url: string }[],
  inboxUrl: string,
): MailMessage {
  return render(to, texts.subject, {
    heading: locale === "cs" ? `Ahoj ${name},` : `Ahoj ${name},`,
    paragraphs: [texts.intro],
    items,
    action: { label: texts.open, url: inboxUrl },
    footnote: texts.footer,
  });
}
