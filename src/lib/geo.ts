/** Poloha OMSI máp – stred SK/CZ a validácia súradníc z formulára. */
export const MAP_CENTER: [number, number] = [49.3, 17.3];
export const MAP_ZOOM = 7;

/** OpenStreetMap dlaždice (vyžaduje uvedenie autorstva; CSP img-src povoľuje iba tento host). */
export const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/** Súradnice z formulára: obe prázdne = bez polohy, inak platné WGS84 zaokrúhlené na ~1 m. */
export function parseLocation(latRaw: string | undefined, lngRaw: string | undefined): { lat: number; lng: number } | null | "INVALID" {
  if (!latRaw && !lngRaw) return null;
  // Number("") je 0 – jedna chýbajúca súradnica nesmie skončiť na rovníku
  if (!latRaw || !lngRaw) return "INVALID";
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return "INVALID";
  return { lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 };
}
