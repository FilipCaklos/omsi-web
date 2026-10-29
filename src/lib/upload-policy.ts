/**
 * Pravidlá uploadu zdieľané klientom (okamžitá spätná väzba) aj serverom (záväzná kontrola).
 */

/** Allowlist prípon pre sťahovateľné súbory modov. */
export const MOD_FILE_EXTENSIONS = ["zip", "7z", "rar", "ams", "hof", "pdf"] as const;
export type ModFileExtension = (typeof MOD_FILE_EXTENSIONS)[number];

/** Allowlist prípon obrázkov – SVG a HTML sú zakázané (Stored XSS). */
export const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"] as const;
export type ImageExtension = (typeof IMAGE_EXTENSIONS)[number];

export const ARCHIVE_EXTENSIONS: ReadonlySet<string> = new Set(["zip", "7z", "rar"]);

export const MOD_FILE_MIME: Record<ModFileExtension, string> = {
  zip: "application/zip",
  "7z": "application/x-7z-compressed",
  rar: "application/vnd.rar",
  ams: "application/octet-stream",
  hof: "text/plain",
  pdf: "application/pdf",
};

/** Spustiteľné a skriptové súbory – archív s nimi sa okamžite zamietne. */
export const BLOCKED_INNER_EXTENSIONS: ReadonlySet<string> = new Set([
  "exe", "msi", "msp", "bat", "cmd", "ps1", "psm1", "vbs", "vbe", "js", "jse", "wsf", "wsh",
  "scr", "hta", "com", "pif", "cpl", "lnk", "reg", "jar", "sys",
]);

/** Natívne pluginy – legitímne v OMSI (plugins/*.dll), ale vyžadujú manuálnu kontrolu. */
export const INSPECTION_INNER_EXTENSIONS: ReadonlySet<string> = new Set(["dll", "ocx", "asi"]);

/** Vnorené archívy – obsah nevieme overiť, idú na manuálnu kontrolu. */
export const NESTED_ARCHIVE_EXTENSIONS: ReadonlySet<string> = new Set(["zip", "7z", "rar", "cab", "tar", "gz", "xz", "bz2", "iso"]);

/** Koreňové priečinky inštalácie OMSI 2 (kanonický tvar). */
export const OMSI_ROOT_FOLDERS: ReadonlyMap<string, string> = new Map(
  [
    "Addons", "Drivers", "Fonts", "GUI", "Humans", "Maps", "Money", "plugins", "Sceneryobjects",
    "Splines", "Texture", "TicketPacks", "Vehicles", "Weather", "Sound",
  ].map((name) => [name.toLowerCase(), name]),
);

export function fileExtension(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

export function isModFileExtension(ext: string): ext is ModFileExtension {
  return (MOD_FILE_EXTENSIONS as readonly string[]).includes(ext);
}

export function isImageExtension(ext: string): ext is ImageExtension {
  return (IMAGE_EXTENSIONS as readonly string[]).includes(ext);
}

/**
 * Bezpečné zobrazované meno súboru: bez ciest, riadiacich a bidi znakov
 * (napr. „mapa‮exe.zip“), max. 180 znakov, s pôvodnou príponou.
 */
export function sanitizeFilename(filename: string): string {
  const base = (filename.split(/[\\/]/).pop() ?? "")
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .replace(/[<>:"|?*]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  if (base.length <= 180) return base || "subor";
  const ext = fileExtension(base);
  const stem = base.slice(0, 180 - ext.length - 1);
  return ext ? `${stem}.${ext}` : stem;
}

export const UPLOAD_CHUNK_MIN = 1024 * 1024;
