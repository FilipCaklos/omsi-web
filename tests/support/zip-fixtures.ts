import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import yazl from "yazl";

export type FixtureEntry = { name: string; content?: string | Buffer; mode?: number; dir?: boolean };

export const fixtureDir = mkdtempSync(path.join(tmpdir(), "omsi-depo-test-"));

/** Vytvorí skutočný ZIP archív v pamäti. */
export function buildZip(entries: FixtureEntry[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const zip = new yazl.ZipFile();
    for (const entry of entries) {
      if (entry.dir) zip.addEmptyDirectory(entry.name);
      else zip.addBuffer(Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content ?? "obsah"), entry.name, entry.mode ? { mode: entry.mode } : {});
    }
    zip.end();
    const chunks: Buffer[] = [];
    zip.outputStream.on("data", (c: Buffer) => chunks.push(c)).on("end", () => resolve(Buffer.concat(chunks))).on("error", reject);
  });
}

/**
 * yazl zakazuje škodlivé cesty – archív s neškodným menom rovnakej dĺžky preto „prepíšeme“
 * priamo v bajtoch (lokálna hlavička aj centrálny adresár), presne ako by to urobil útočník.
 */
export function patchName(zip: Buffer, from: string, to: string): Buffer {
  if (from.length !== to.length) throw new Error("Mená musia mať rovnakú dĺžku");
  const result = Buffer.from(zip);
  const needle = Buffer.from(from);
  let index = result.indexOf(needle);
  let count = 0;
  while (index !== -1) {
    Buffer.from(to).copy(result, index);
    count += 1;
    index = result.indexOf(needle, index + 1);
  }
  if (count < 2) throw new Error("Meno sa nenašlo v hlavičkách");
  return result;
}

export function writeFixture(name: string, data: Buffer | string): string {
  const file = path.join(fixtureDir, name);
  writeFileSync(file, data);
  return file;
}
