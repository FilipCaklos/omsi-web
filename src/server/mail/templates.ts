import type { AppLocale } from "@/i18n/config";
import { contactEmail, env } from "@/lib/env";
import { BRAND, button, emailFrame, escapeHtml, footerLinks, heading, paragraph } from "./layout";
import type { MailMessage } from "./transport";

type Block = {
  heading: string;
  paragraphs: string[];
  items?: { text: string; url: string }[];
  action?: { label: string; url: string };
  footnote: string;
};

/** Email v grafike OMSI Depo (logo, pásik, pätička) + textová verzia pre klientov bez HTML. */
function render(to: string, subject: string, block: Block, locale: AppLocale = "sk"): MailMessage {
  const base = env().APP_URL;
  const itemsHtml = block.items?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px">${block.items
        .map(
          (i) =>
            `<tr><td style="padding:10px 12px;border-left:3px solid ${BRAND.amber};background:#FFF8EB;font-size:14px;line-height:1.5"><a href="${escapeHtml(i.url)}" style="color:${BRAND.text};text-decoration:none">${escapeHtml(i.text)}</a></td></tr><tr><td height="6" style="font-size:0;line-height:6px">&nbsp;</td></tr>`,
        )
        .join("")}</table>`
    : "";
  const actionHtml = block.action
    ? `${button(block.action.label, block.action.url)}<p style="margin:0 0 14px;font-size:12px;color:${BRAND.muted};word-break:break-all">${escapeHtml(block.action.url)}</p>`
    : "";
  const html = emailFrame({
    base,
    preheader: block.paragraphs[0],
    bodyHtml: `${heading(block.heading)}${block.paragraphs.map(paragraph).join("")}${itemsHtml}${actionHtml}`,
    footerHtml: footerLinks(base, contactEmail(), block.footnote, locale === "cs"),
  });
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
    }, "cs");
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
    }, "cs");
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
    }, "cs");
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
    }, "cs");
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
  return render(
    to,
    texts.subject,
    { heading: `Ahoj ${name},`, paragraphs: [texts.intro], items, action: { label: texts.open, url: inboxUrl }, footnote: texts.footer },
    locale,
  );
}
