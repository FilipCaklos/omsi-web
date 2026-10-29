import { describe, expect, it } from "vitest";
import { letterHtml, signatureHtml, signatureInfo } from "@/server/mail/gmail-kit";
import { emailFrame } from "@/server/mail/layout";

const DEFAULTS = { name: "OMSI Depo", email: "kontakt@omsidepo.eu", discord: null, base: "https://omsidepo.eu" };

describe("emaily s grafikou OMSI Depo", () => {
  it("rámec obsahuje logo z verejnej adresy webu a skrytý úvodný text", () => {
    const html = emailFrame({ base: "https://omsidepo.eu", preheader: "Potvrď email", bodyHtml: "<p>x</p>", footerHtml: "" });
    expect(html).toContain('src="https://omsidepo.eu/brand/logo-on-dark.png"');
    expect(html).toContain("Potvrď email");
  });

  it("údaje podpisu z adresy sa escapujú a nevalidné sa ignorujú", () => {
    const info = signatureInfo(
      new URLSearchParams({ meno: '<img src=x onerror="alert(1)">', email: "zly email", discord: "javascript:alert(1)", rola: "moderátor" }),
      DEFAULTS,
    );
    expect(info).toMatchObject({ email: "kontakt@omsidepo.eu", discord: null, role: "moderátor" });
    const html = signatureHtml(info) + letterHtml(info);
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).not.toContain("javascript:");
  });

  it("platná Discord pozvánka a email sa použijú", () => {
    const info = signatureInfo(new URLSearchParams({ meno: "Filip", email: "filip@omsidepo.eu", discord: "https://discord.gg/omsi" }), DEFAULTS);
    const html = signatureHtml(info);
    expect(html).toContain('href="mailto:filip@omsidepo.eu"');
    expect(html).toContain('href="https://discord.gg/omsi"');
  });
});
