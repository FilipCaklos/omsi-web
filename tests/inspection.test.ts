import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sanitizeFilename } from "@/lib/upload-policy";
import { analyzeEntries, classifyPath } from "@/server/inspection/entries";
import { inspectFile } from "@/server/inspection/inspect";
import { SltParser, listWithSevenZip } from "@/server/inspection/seven-zip";
import { buildZip, patchName, writeFixture } from "./support/zip-fixtures";

const options = { sevenZipPath: "7zz-urcite-neexistuje", maxEntries: 1000, maxUncompressedBytes: 1024 ** 3 };
const sha = (data: Buffer) => createHash("sha256").update(data).digest("hex");

describe("kontrola ZIP archívov", () => {
  it("čistý OMSI mod: CLEAN, SHA-256, priečinky a inštalačný koreň", async () => {
    const zip = await buildZip([
      { name: "Maps/Strbske Pleso/global.cfg", content: "[name]\nŠtrbské Pleso" },
      { name: "Vehicles/Karosa_B732/model/model.cfg" },
      { name: "Sceneryobjects/SK_Oznacnik/oznacnik.sco" },
      { name: "ReadMe.pdf", content: "%PDF-1.4" },
    ]);
    const file = writeFixture("clean.zip", zip);
    const result = await inspectFile(file, "zip", options);
    expect(result.verdict).toBe("CLEAN");
    expect(result.sha256).toBe(sha(zip));
    expect(result.archiveFormat).toBe("ZIP");
    expect(result.omsiFolders).toEqual(["Maps", "Sceneryobjects", "Vehicles"]);
    expect(result.installPrefix).toBe("");
    expect(result.entryCount).toBe(4);
    expect(result.entries?.map((e) => e.p)).toContain("Maps/Strbske Pleso/global.cfg");
  });

  it("obalový priečinok: nápoveda rozbaliť jeho obsah", async () => {
    const zip = await buildZip([{ name: "Moja Mapa v1.2/Maps/x/global.cfg" }, { name: "Moja Mapa v1.2/Splines/a.sli" }]);
    const result = await inspectFile(writeFixture("wrapped.zip", zip), "zip", options);
    expect(result.installPrefix).toBe("Moja Mapa v1.2/");
    expect(result.omsiFolders).toEqual(["Maps", "Splines"]);
  });

  it("Zip Slip (../) → REJECTED", async () => {
    const zip = patchName(await buildZip([{ name: "xx/evil.txt" }]), "xx/evil.txt", "../evil.txt");
    const result = await inspectFile(writeFixture("slip.zip", zip), "zip", options);
    expect(result.verdict).toBe("REJECTED");
    expect(result.findings[0]?.code).toBe("PATH_TRAVERSAL");
  });

  it("absolútna cesta → REJECTED", async () => {
    const zip = patchName(await buildZip([{ name: "x/etc/passwd" }]), "x/etc/passwd", "/etc/passwdx");
    const result = await inspectFile(writeFixture("abs.zip", zip), "zip", options);
    expect(result.verdict).toBe("REJECTED");
  });

  it("spustiteľný súbor vo vnútri (aj s dvojitou príponou) → REJECTED", async () => {
    const zip = await buildZip([{ name: "Vehicles/bus/readme.pdf.exe", content: "MZ" }, { name: "Maps/run.bat" }]);
    const result = await inspectFile(writeFixture("exe.zip", zip), "zip", options);
    expect(result.verdict).toBe("REJECTED");
    expect(result.findings.map((f) => f.path)).toEqual(["Vehicles/bus/readme.pdf.exe", "Maps/run.bat"]);
  });

  it("OMSI plugin .dll → REQUIRES_MOD_INSPECTION", async () => {
    const zip = await buildZip([{ name: "plugins/IBIS.dll", content: "binary" }, { name: "plugins/IBIS.opl" }]);
    const result = await inspectFile(writeFixture("dll.zip", zip), "zip", options);
    expect(result.verdict).toBe("REQUIRES_MOD_INSPECTION");
    expect(result.findings).toEqual([{ code: "NATIVE_PLUGIN", path: "plugins/IBIS.dll" }]);
  });

  it("vnorený archív → REQUIRES_MOD_INSPECTION", async () => {
    const zip = await buildZip([{ name: "Addons/repaint.zip", content: await buildZip([{ name: "a.txt" }]) }]);
    expect((await inspectFile(writeFixture("nested.zip", zip), "zip", options)).verdict).toBe("REQUIRES_MOD_INSPECTION");
  });

  it("symbolický odkaz → REJECTED", async () => {
    const zip = await buildZip([{ name: "Maps/link", content: "/etc/passwd", mode: 0o120777 }]);
    const result = await inspectFile(writeFixture("symlink.zip", zip), "zip", options);
    expect(result.findings.map((f) => f.code)).toContain("SYMLINK");
    expect(result.verdict).toBe("REJECTED");
  });

  it("premenovaný .exe ako .zip / .7z → REJECTED (magic bytes)", async () => {
    const pe = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(200, 0x90)]);
    expect((await inspectFile(writeFixture("fake.zip", pe), "zip", options)).findings[0]?.code).toBe("EXECUTABLE_FILE");
    const zip = await buildZip([{ name: "a.txt" }]);
    expect((await inspectFile(writeFixture("zip-as.7z", zip), "7z", options)).findings[0]?.code).toBe("MAGIC_MISMATCH");
    const html = Buffer.from("<!DOCTYPE html><script>alert(1)</script>");
    expect((await inspectFile(writeFixture("x.pdf", html), "pdf", options)).verdict).toBe("REJECTED");
  });

  it("poškodený ZIP → REJECTED", async () => {
    const zip = await buildZip([{ name: "a.txt" }]);
    const broken = zip.subarray(0, zip.length - 30);
    expect((await inspectFile(writeFixture("broken.zip", broken), "zip", options)).findings[0]?.code).toBe("CORRUPT_ARCHIVE");
  });

  it("HOF musí byť text", async () => {
    const hof = Buffer.from("[name]\nDPB Bratislava\n[addterminus_list]\n", "latin1");
    expect((await inspectFile(writeFixture("dpb.hof", hof), "hof", options)).verdict).toBe("CLEAN");
    expect((await inspectFile(writeFixture("bin.hof", Buffer.from([1, 0, 2, 0])), "hof", options)).findings[0]?.code).toBe("NOT_TEXT");
  });

  it("7z bez dostupného 7zz → manuálna kontrola, nie zverejnenie", async () => {
    const sevenZ = Buffer.concat([Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c, 0, 4]), Buffer.alloc(64)]);
    const result = await inspectFile(writeFixture("map.7z", sevenZ), "7z", options);
    expect(result.verdict).toBe("REQUIRES_MOD_INSPECTION");
    expect(result.findings[0]?.code).toBe("INSPECTOR_UNAVAILABLE");
    expect(await listWithSevenZip("7zz-urcite-neexistuje", "x", 10)).toEqual({ ok: false, reason: "UNAVAILABLE" });
  });
});

describe("parser výstupu 7zz l -slt", () => {
  it("rozpozná priečinky, veľkosti, šifrovanie a symlinky", () => {
    const output = `
7-Zip (z) 26.01 (x64) : Copyright (c) 1999-2026 Igor Pavlov

Listing archive: mapa.7z

--
Path = mapa.7z
Type = 7z
Physical Size = 1234

----------
Path = Maps/Pezinok
Size = 0
Packed Size = 0
Attributes = D...
Folder = +
Encrypted = -

Path = Maps/Pezinok/global.cfg
Size = 4096
Packed Size = 900
Attributes = A....
Encrypted = -

Path = Vehicles/link
Size = 11
Packed Size = 11
Attributes = A_ lrwxrwxrwx
Encrypted = +
`;
    const parser = new SltParser();
    for (const line of output.split("\n")) parser.push(line);
    const entries = parser.finish();
    expect(entries).toEqual([
      { path: "Maps/Pezinok", size: 0, compressedSize: 0, isDirectory: true, isSymlink: false, isEncrypted: false },
      { path: "Maps/Pezinok/global.cfg", size: 4096, compressedSize: 900, isDirectory: false, isSymlink: false, isEncrypted: false },
      { path: "Vehicles/link", size: 11, compressedSize: 11, isDirectory: false, isSymlink: true, isEncrypted: true },
    ]);
  });
});

describe("cesty v archíve a názvy súborov", () => {
  it.each([
    ["Maps\\Mapa\\global.cfg", undefined],
    ["../x", "PATH_TRAVERSAL"],
    ["a/../../x", "PATH_TRAVERSAL"],
    ["C:\\Windows\\x.dll", "ABSOLUTE_PATH"],
    ["/etc/x", "ABSOLUTE_PATH"],
    ["Maps/info.txt:skryte.exe", "PATH_TRAVERSAL"],
    ["Maps/fdp.\u202Eexe.txt", "BIDI_FILENAME"],
  ])("%s → %s", (input, problem) => {
    expect(classifyPath(input).problem).toBe(problem);
  });

  it("zip bomba: limit počtu položiek a rozbalenej veľkosti", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ path: `f${i}`, size: 1, isDirectory: false }));
    expect(analyzeEntries(many, { maxEntries: 10, maxUncompressedBytes: 1e9 }).findings[0]?.code).toBe("TOO_MANY_ENTRIES");
    const huge = [{ path: "a", size: 2e9, compressedSize: 1e6, isDirectory: false }];
    const codes = analyzeEntries(huge, { maxEntries: 10, maxUncompressedBytes: 1e9 }).findings.map((f) => f.code);
    expect(codes).toEqual(expect.arrayContaining(["TOO_LARGE_UNCOMPRESSED", "SUSPICIOUS_RATIO"]));
  });

  it("sanitizeFilename odstráni cesty a bidi znaky", () => {
    expect(sanitizeFilename("C:\\Users\\x\\Štrbské Pleso v1.0.7z")).toBe("Štrbské Pleso v1.0.7z");
    expect(sanitizeFilename("mapa\u202Eexe.zip")).toBe("mapaexe.zip");
    expect(sanitizeFilename("../../.htaccess")).toBe("htaccess");
  });
});
