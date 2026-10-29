import { open } from "node:fs/promises";

export type DetectedFormat = "ZIP" | "SEVEN_Z" | "RAR" | "PDF" | "PE" | "ELF" | "MACHO" | "SHEBANG" | "HTML" | "UNKNOWN";

const startsWith = (buf: Buffer, bytes: readonly number[], offset = 0) =>
  buf.length >= offset + bytes.length && bytes.every((b, i) => buf[offset + i] === b);

/** Rozpozná formát podľa prvých bajtov (nezávisle od prípony). */
export function detectFormat(head: Buffer): DetectedFormat {
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04]) || startsWith(head, [0x50, 0x4b, 0x05, 0x06]) || startsWith(head, [0x50, 0x4b, 0x07, 0x08])) {
    return "ZIP";
  }
  if (startsWith(head, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) return "SEVEN_Z";
  if (startsWith(head, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07])) return "RAR";
  if (startsWith(head, [0x4d, 0x5a])) return "PE";
  if (startsWith(head, [0x7f, 0x45, 0x4c, 0x46])) return "ELF";
  if (
    startsWith(head, [0xfe, 0xed, 0xfa, 0xce]) || startsWith(head, [0xfe, 0xed, 0xfa, 0xcf]) ||
    startsWith(head, [0xce, 0xfa, 0xed, 0xfe]) || startsWith(head, [0xcf, 0xfa, 0xed, 0xfe])
  ) {
    return "MACHO";
  }
  if (startsWith(head, [0x23, 0x21])) return "SHEBANG";
  // PDF hlavička môže mať pred sebou max. 1024 bajtov balastu
  if (head.subarray(0, 1024).includes("%PDF-")) return "PDF";
  const text = head.subarray(0, 512).toString("latin1").trimStart().toLowerCase();
  if (text.startsWith("<!doctype html") || text.startsWith("<html") || text.startsWith("<script") || text.startsWith("<svg")) {
    return "HTML";
  }
  return "UNKNOWN";
}

export async function readHead(filePath: string, bytes = 64 * 1024): Promise<Buffer> {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/** HOF je textový INI súbor (Windows-1250/UTF-8) – žiadne NUL bajty v úvode. */
export function looksLikeText(head: Buffer): boolean {
  if (head.length === 0) return false;
  let control = 0;
  for (const byte of head) {
    if (byte === 0) return false;
    if (byte < 0x09 || (byte > 0x0d && byte < 0x20)) control += 1;
  }
  return control / head.length < 0.01;
}
