import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { RawEntry } from "./entries";

export type SevenZipResult =
  | { ok: true; entries: RawEntry[] }
  | { ok: false; reason: "UNAVAILABLE" | "ENCRYPTED" | "CORRUPT_ARCHIVE" | "TOO_MANY_ENTRIES" | "TIMEOUT" };

/**
 * Parser výstupu `7zz l -slt`. Bloky „Kľúč = hodnota“ oddelené prázdnym riadkom;
 * položky archívu nasledujú až za oddeľovačom „----------“.
 */
export class SltParser {
  readonly entries: RawEntry[] = [];
  private inEntries = false;
  private current: Map<string, string> = new Map();

  push(line: string): void {
    if (!this.inEntries) {
      if (line.startsWith("----------")) this.inEntries = true;
      return;
    }
    if (line.trim() === "") {
      this.flush();
      return;
    }
    const sep = line.indexOf(" = ");
    if (sep > 0) this.current.set(line.slice(0, sep), line.slice(sep + 3));
    else if (line.endsWith(" =")) this.current.set(line.slice(0, -2), "");
  }

  finish(): RawEntry[] {
    this.flush();
    return this.entries;
  }

  private flush(): void {
    const path = this.current.get("Path");
    if (path !== undefined) {
      const attributes = this.current.get("Attributes") ?? "";
      const isDirectory = this.current.get("Folder") === "+" || /^D/.test(attributes);
      const link = this.current.get("Symbolic Link") ?? this.current.get("Link") ?? "";
      this.entries.push({
        path,
        size: Number(this.current.get("Size") ?? "0") || 0,
        compressedSize: Number(this.current.get("Packed Size") ?? "0") || 0,
        isDirectory,
        isSymlink: link.length > 0 || /\bl[rwx-]{9}\b/.test(attributes),
        isEncrypted: this.current.get("Encrypted") === "+",
      });
    }
    this.current = new Map();
  }
}

/**
 * Zoznam položiek .7z/.rar cez oficiálny 7-Zip. Archív sa nerozbaľuje.
 * `-p` s fiktívnym heslom zabráni interaktívnej výzve pri šifrovaných hlavičkách.
 */
export function listWithSevenZip(
  binary: string,
  filePath: string,
  maxEntries: number,
  timeoutMs = 120_000,
): Promise<SevenZipResult> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (result: SevenZipResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const child = spawn(binary, ["l", "-slt", "-sccUTF-8", "-pOMSIDEPO_NO_PASSWORD", "--", filePath], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      done({ ok: false, reason: "TIMEOUT" });
    }, timeoutMs);

    const parser = new SltParser();
    let stderr = "";
    createInterface({ input: child.stdout }).on("line", (line) => {
      parser.push(line);
      if (parser.entries.length > maxEntries) {
        child.kill("SIGKILL");
        done({ ok: false, reason: "TOO_MANY_ENTRIES" });
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 8192) stderr += chunk.toString("utf8");
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      done({ ok: false, reason: error.code === "ENOENT" ? "UNAVAILABLE" : "CORRUPT_ARCHIVE" });
    });
    child.on("close", (code) => {
      const entries = parser.finish();
      if (/wrong password|encrypted|can not open encrypted/i.test(stderr)) {
        done({ ok: false, reason: "ENCRYPTED" });
      } else if (code !== 0) {
        done({ ok: false, reason: "CORRUPT_ARCHIVE" });
      } else {
        done({ ok: true, entries });
      }
    });
  });
}
