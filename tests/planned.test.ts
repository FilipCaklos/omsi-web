import { describe, expect, it } from "vitest";
import { cs } from "@/i18n/dictionaries/cs";
import { sk } from "@/i18n/dictionaries/sk";
import { notificationText } from "@/lib/notification-text";
import { localDateTimeToUtc, utcToLocalInput } from "@/lib/timezone";

describe("dátum vydania v čase SR/ČR", () => {
  it("zimný čas (SEČ = UTC+1)", () => {
    expect(localDateTimeToUtc("2026-12-24T18:00")?.toISOString()).toBe("2026-12-24T17:00:00.000Z");
  });
  it("letný čas (SELČ = UTC+2)", () => {
    expect(localDateTimeToUtc("2027-07-01T18:00")?.toISOString()).toBe("2027-07-01T16:00:00.000Z");
  });
  it("deň prechodu na zimný čas (25. 10. 2026)", () => {
    expect(localDateTimeToUtc("2026-10-25T12:00")?.toISOString()).toBe("2026-10-25T11:00:00.000Z");
  });
  it("spätný prevod pre formulár a neplatné vstupy", () => {
    expect(utcToLocalInput(new Date("2026-12-24T17:00:00Z"))).toBe("2026-12-24T18:00");
    expect(utcToLocalInput(new Date("2027-07-01T16:00:00Z"))).toBe("2027-07-01T18:00");
    expect(localDateTimeToUtc("24.12.2026 18:00")).toBeNull();
    expect(localDateTimeToUtc("2026-12-24")).toBeNull();
  });
});

describe("texty notifikácií", () => {
  it("dosadí parametre v jazyku používateľa", () => {
    expect(notificationText(sk, "MOD_RELEASED", { modTitle: "Pezinok – Modra" })).toBe("Pezinok – Modra je vonku na stiahnutie!");
    expect(notificationText(cs, "NEW_VERSION", { modTitle: "Karosa B 732", version: "1.0.2" })).toBe("Karosa B 732: nová verze 1.0.2");
  });
  it("stav hlásenia preloží a chýbajúce parametre vynechá", () => {
    expect(notificationText(sk, "BUG_REPORT_STATUS", { title: "Chýba spline", modTitle: "Mapa", status: "FIXED" })).toBe(
      "Hlásenie „Chýba spline“ (Mapa) – nový stav: Opravené",
    );
    expect(notificationText(sk, "DEVLOG_POSTED", null)).toBe(": nový devlog „“");
  });
});
