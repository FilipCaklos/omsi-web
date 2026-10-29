import { describe, expect, it } from "vitest";
import { buildDownloadCenter, type CenterFile, type CenterVersion } from "@/server/mods/download-center";

let seq = 0;
function file(kind: CenterFile["kind"], version: { id: string; version: string; publishedAt: Date }, extra: Partial<CenterFile> = {}): CenterFile {
  seq += 1;
  return {
    id: `file${seq}`,
    kind,
    displayName: `${kind} ${version.version}`,
    description: "",
    filename: `${kind}.7z`,
    extension: "7z",
    sizeBytes: 1000,
    sha256: "a".repeat(64),
    virusTotal: { status: "CLEAN", detections: 0, engines: 70 },
    scanStatus: "CLEAN",
    archiveFormat: "SEVEN_Z",
    archiveEntryCount: 0,
    archiveUncompressedBytes: null,
    omsiFolders: [],
    installPrefix: null,
    entriesTruncated: false,
    mirrorUrl: null,
    mirrorLabel: null,
    downloadCount: 0,
    versionId: version.id,
    version: version.version,
    versionPublishedAt: version.publishedAt,
    sortOrder: 0,
    ...extra,
  };
}

function version(v: string, day: number, build: (meta: { id: string; version: string; publishedAt: Date }) => CenterFile[]): CenterVersion {
  const meta = { id: `v-${v}`, version: v, publishedAt: new Date(Date.UTC(2026, 0, day)) };
  return { ...meta, files: build(meta) };
}

describe("panel Súbory na stiahnutie", () => {
  it("1.0.0 (hlavný + HOF) → 1.0.2 (iba patch): hlavný zostáva, patch navrchu", () => {
    const v100 = version("1.0.0", 1, (m) => [file("MAIN", m), file("OPTIONAL", m, { displayName: "HOF" })]);
    const v102 = version("1.0.2", 10, (m) => [file("PATCH", m)]);
    const center = buildDownloadCenter([v100, v102]);
    expect(center.main?.version).toBe("1.0.0");
    expect(center.patches.map((f) => f.version)).toEqual(["1.0.2"]);
    expect(center.optional.map((f) => f.displayName)).toEqual(["HOF"]);
    expect(center.oldVersions).toEqual([]);
  });

  it("nová hlavná verzia 2.0 presunie 1.x (aj jej patche) do archívu", () => {
    const v100 = version("1.0.0", 1, (m) => [file("OLD_VERSION", m)]);
    const v102 = version("1.0.2", 10, (m) => [file("PATCH", m)]);
    const v200 = version("2.0.0", 20, (m) => [file("MAIN", m)]);
    const center = buildDownloadCenter([v100, v102, v200]);
    expect(center.main?.version).toBe("2.0.0");
    expect(center.patches).toEqual([]);
    expect(center.oldVersions.map((v) => v.version)).toEqual(["1.0.2", "1.0.0"]);
  });

  it("viac patchov: najnovší je prvý", () => {
    const v1 = version("1.0", 1, (m) => [file("MAIN", m)]);
    const p1 = version("1.0.1", 5, (m) => [file("PATCH", m)]);
    const p2 = version("1.0.2", 9, (m) => [file("PATCH", m)]);
    expect(buildDownloadCenter([p1, v1, p2]).patches.map((f) => f.version)).toEqual(["1.0.2", "1.0.1"]);
  });

  it("bez zverejnených verzií je panel prázdny", () => {
    expect(buildDownloadCenter([])).toEqual({ main: null, patches: [], optional: [], oldVersions: [] });
  });
});
