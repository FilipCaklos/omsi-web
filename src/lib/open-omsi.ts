/**
 * openOMSI – open-source reimplementácia OMSI 2 (Linux, macOS, Windows), ktorá načítava existujúce mapy a mody.
 * Je vo vývoji, preto kompatibilitu každého modu udáva autor.
 */
export const OPEN_OMSI_URL = "https://github.com/turbo-devv/openOMSI";

export const OPEN_OMSI_VALUES = ["UNTESTED", "WORKS", "PARTIAL", "NOT_WORKING", "EXCLUSIVE"] as const;
export type OpenOmsiSupport = (typeof OPEN_OMSI_VALUES)[number];

/** Mod sa dá v openOMSI hrať (filter „Funguje v openOMSI“, odznak na karte). */
export function worksInOpenOmsi(value: OpenOmsiSupport): boolean {
  return value === "WORKS" || value === "EXCLUSIVE";
}

export function parseOpenOmsi(value: unknown): OpenOmsiSupport {
  return OPEN_OMSI_VALUES.find((v) => v === value) ?? "UNTESTED";
}
