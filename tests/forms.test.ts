import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const { keepValues } = await import("@/server/action-guard");
const { notificationText } = await import("@/lib/notification-text");
const { sk } = await import("@/i18n/dictionaries/sk");
const { cs } = await import("@/i18n/dictionaries/cs");

describe("formuláre – hodnoty po chybe", () => {
  function form(entries: [string, string][]) {
    const data = new FormData();
    for (const [k, v] of entries) data.append(k, v);
    return data;
  }

  it("pri chybe vráti odoslané hodnoty, viacnásobné spojí čiarkou", () => {
    const state = keepValues({ status: "error", error: "GENERIC", attempt: 1 }, form([["details", "Krátke"], ["reason", "SPAM"], ["fileId", "a"], ["fileId", "b"]]), [
      "reason",
      "details",
      "fileId",
      "missing",
    ]);
    expect(state.values).toEqual({ reason: "SPAM", details: "Krátke", fileId: "a,b", missing: "" });
  });

  it("úspech nechá bez zmeny a existujúce hodnoty zachová", () => {
    const ok = { status: "success" as const, attempt: 2 };
    expect(keepValues(ok, form([["body", "x"]]), ["body"])).toBe(ok);
    const kept = keepValues({ status: "error", attempt: 1, values: { outcome: "x" } }, form([["body", "text"]]), ["body"]);
    expect(kept.values).toEqual({ outcome: "x", body: "text" });
  });
});

describe("upozornenie o novom nahlásení", () => {
  it("dôvod sa preloží do jazyka príjemcu", () => {
    const data = { modTitle: "Pezinok – Modra", reason: "OFFENSIVE" };
    expect(notificationText(sk, "REPORT_NEW", data)).toBe("Nové nahlásenie (Urážlivý obsah): Pezinok – Modra");
    expect(notificationText(cs, "REPORT_NEW", data)).toContain("Nové nahlášení (");
  });
});
