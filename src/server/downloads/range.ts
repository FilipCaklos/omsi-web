export type RangeResult =
  | { type: "full" }
  | { type: "partial"; start: number; end: number }
  | { type: "unsatisfiable" };

/**
 * Parser hlavičky Range (RFC 9110 §14.2) pre jeden rozsah bajtov.
 * Viac rozsahov naraz (multipart/byteranges) server smie ignorovať – vtedy pošleme celý súbor.
 */
export function parseRange(header: string | null, size: number): RangeResult {
  if (!header) return { type: "full" };
  const match = /^\s*bytes\s*=\s*(.+)$/i.exec(header);
  if (!match?.[1]) return { type: "full" };
  const specs = match[1].split(",");
  if (specs.length !== 1) return { type: "full" };

  const spec = specs[0]?.trim() ?? "";
  const parts = /^(\d*)-(\d*)$/.exec(spec);
  if (!parts) return { type: "full" };
  const [, startRaw = "", endRaw = ""] = parts;
  if (startRaw === "" && endRaw === "") return { type: "full" };
  if (size === 0) return { type: "unsatisfiable" };

  if (startRaw === "") {
    // Suffix: posledných N bajtov
    const suffix = Number(endRaw);
    if (suffix === 0) return { type: "unsatisfiable" };
    return { type: "partial", start: Math.max(0, size - suffix), end: size - 1 };
  }

  const start = Number(startRaw);
  if (!Number.isSafeInteger(start) || start >= size) return { type: "unsatisfiable" };
  const end = endRaw === "" ? size - 1 : Math.min(Number(endRaw), size - 1);
  if (!Number.isSafeInteger(end) || end < start) return { type: "full" };
  return { type: "partial", start, end };
}

/** Content-Disposition s ASCII náhradou a RFC 5987 filename* pre diakritiku (Štrbské Pleso.7z). */
export function contentDisposition(filename: string): string {
  const ascii = filename
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
