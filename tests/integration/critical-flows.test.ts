/**
 * Integračné testy kritických tokov proti skutočnej PostgreSQL (PGlite) a skutočným route handlerom:
 *  1. bezpečnosť uploadu (chunked upload, kontrola archívov, Origin/autentifikácia),
 *  2. sťahovanie bez registrácie (token, HTTP 200/206/416, anti-hotlink, počítadlo),
 *  3. moderácia (neschválený obsah je neverejný, schválenie ho sprístupní),
 *  4. automatické odomknutie naplánovaného vydania.
 */
import { createHash, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import yazl from "yazl";
import { startTestStack } from "./support/test-stack";

const ORIGIN = "http://localhost:3000";
const AUTHOR_IP = "198.51.100.10";
const GUEST_IP = "203.0.113.50";
const sha = (data: Buffer | Uint8Array) => createHash("sha256").update(data).digest("hex");

function zip(entries: [string, Buffer | string][]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = new yazl.ZipFile();
    for (const [name, data] of entries) archive.addBuffer(Buffer.isBuffer(data) ? data : Buffer.from(data), name, { compress: false });
    archive.end();
    const chunks: Buffer[] = [];
    archive.outputStream.on("data", (c: Buffer) => chunks.push(c)).on("end", () => resolve(Buffer.concat(chunks))).on("error", reject);
  });
}

let stack: Awaited<ReturnType<typeof startTestStack>>;
type Routes = Record<string, { [method: string]: (req: Request, ctx?: { params: Promise<Record<string, string>> }) => Promise<Response> }>;
let routes: Routes;
// Aplikačné moduly sa načítajú až po nastavení prostredia (konfigurácia sa číta lenivo)
let app: {
  db: () => import("@/generated/prisma/client").PrismaClient;
  uploadInChunks: typeof import("@/lib/chunked-upload").uploadInChunks;
  createModFileFromUpload: typeof import("@/server/uploads/service").createModFileFromUpload;
  approve: typeof import("@/server/admin/moderation").approve;
  decideFile: typeof import("@/server/admin/moderation").decideFile;
  publishDueScheduled: typeof import("@/server/mods/releases").publishDueScheduled;
  findDownloadableFile: typeof import("@/server/downloads/access").findDownloadableFile;
};
let authorCookie = "";
let authorId = "";
let moderator: { id: string; role: "MODERATOR" };
let categoryId = "";

async function call(url: string, init: RequestInit = {}, opts: { ip?: string; cookie?: string | null; origin?: string | null } = {}): Promise<Response> {
  const target = new URL(url, ORIGIN);
  const headers = new Headers(init.headers);
  if (opts.cookie !== null) headers.set("cookie", opts.cookie ?? authorCookie);
  if (opts.origin !== null) headers.set("origin", opts.origin ?? ORIGIN);
  headers.set("x-forwarded-for", opts.ip ?? AUTHOR_IP);
  const req = new Request(target, { ...init, headers, duplex: "half" } as RequestInit);
  const p = target.pathname.split("/").filter(Boolean);
  const method = (init.method ?? "GET").toUpperCase();
  const params = (value: Record<string, string>) => ({ params: Promise.resolve(value) });
  if (p[1] === "uploads" && p.length === 2) return routes.uploads!.POST!(req);
  if (p[1] === "uploads" && p.length === 3) return routes.upload![method]!(req, params({ id: p[2]! }));
  if (p[1] === "uploads" && p[3] === "chunks") return routes.chunk!.PUT!(req, params({ id: p[2]!, index: p[4]! }));
  if (p[1] === "uploads" && p[3] === "complete") return routes.complete!.POST!(req, params({ id: p[2]! }));
  if (p[1] === "download" && p.length === 2) return routes.download!.POST!(req);
  if (p[1] === "download") return routes.token![method]!(req, params({ token: p[2]! }));
  throw new Error(`Neznáma cesta ${target.pathname}`);
}

async function upload(data: Buffer, filename: string) {
  return app.uploadInChunks(new File([new Uint8Array(data)], filename), {
    baseUrl: ORIGIN,
    fetchImpl: ((url: string, init?: RequestInit) => call(url, init)) as typeof fetch,
    resumeStore: null,
    pollIntervalMs: 20,
  });
}

async function publishedModWithFile(slug: string, data: Buffer, status: "PUBLISHED" | "PENDING_REVIEW" = "PUBLISHED") {
  const uploaded = await upload(data, `${slug}.zip`);
  const mod = await app.db().mod.create({
    data: { slug, title: slug, summary: "Testovací mod pre integračné testy", authorId, categoryId, status, publishedAt: status === "PUBLISHED" ? new Date() : null },
  });
  const version = await app.db().modVersion.create({
    data: { modId: mod.id, version: "1.0.0", status: status === "PUBLISHED" ? "PUBLISHED" : "PENDING_REVIEW", publishedAt: status === "PUBLISHED" ? new Date() : null },
  });
  const file = await app.createModFileFromUpload(authorId, { uploadId: uploaded.id, modId: mod.id, versionId: version.id, kind: "MAIN", displayName: "Hlavný súbor" });
  if (status === "PUBLISHED") await app.db().mod.update({ where: { id: mod.id }, data: { currentVersionId: version.id } });
  return { mod, version, file, uploaded };
}

async function guestToken(fileId: string, ip = GUEST_IP): Promise<Response> {
  const form = new FormData();
  form.set("fileId", fileId);
  return call("/api/download", { method: "POST", body: form }, { cookie: null, ip });
}

beforeAll(async () => {
  stack = await startTestStack();
  const imp = async <T,>(p: string) => (await import(p)) as T;
  routes = {
    uploads: await imp("@/app/api/uploads/route"),
    upload: await imp("@/app/api/uploads/[id]/route"),
    chunk: await imp("@/app/api/uploads/[id]/chunks/[index]/route"),
    complete: await imp("@/app/api/uploads/[id]/complete/route"),
    download: await imp("@/app/api/download/route"),
    token: await imp("@/app/api/download/[token]/route"),
  } as Routes;
  const { db } = await import("@/lib/db");
  const { getAuth } = await import("@/server/auth");
  app = {
    db,
    uploadInChunks: (await import("@/lib/chunked-upload")).uploadInChunks,
    createModFileFromUpload: (await import("@/server/uploads/service")).createModFileFromUpload,
    approve: (await import("@/server/admin/moderation")).approve,
    decideFile: (await import("@/server/admin/moderation")).decideFile,
    publishDueScheduled: (await import("@/server/mods/releases")).publishDueScheduled,
    findDownloadableFile: (await import("@/server/downloads/access")).findDownloadableFile,
  };

  const headers = new Headers({ "x-forwarded-for": AUTHOR_IP });
  await getAuth().api.signUpEmail({ body: { name: "Autor", email: "autor@test.sk", password: "Testovanie-2026", username: "autor.test", callbackURL: "/" }, headers });
  await db().user.update({ where: { username: "autor.test" }, data: { emailVerified: true, role: "VERIFIED_CREATOR" } });
  const signIn = await getAuth().api.signInEmail({ body: { email: "autor@test.sk", password: "Testovanie-2026" }, headers, returnHeaders: true });
  authorCookie = (signIn.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  authorId = (await db().user.findUniqueOrThrow({ where: { username: "autor.test" } })).id;
  const mod = await db().user.create({ data: { name: "Moderátor", email: "mod@test.sk", username: "moderator.test", role: "MODERATOR", emailVerified: true } });
  moderator = { id: mod.id, role: "MODERATOR" };
  categoryId = (await db().category.create({ data: { slug: "mapy", nameSk: "Mapy", nameCs: "Mapy", icon: "map" } })).id;
}, 120_000);

afterAll(async () => {
  await stack?.stop();
});

describe("bezpečnosť uploadu", () => {
  it("chunked upload: OMSI archív prejde, SHA-256 sedí so serverom", async () => {
    const data = await zip([["Maps/Test/global.cfg", "[name]\nTest\n"], ["Maps/Test/tile_0_0.map", randomBytes(2_500_000)]]);
    const status = await upload(data, "mapa.zip");
    expect(status).toMatchObject({ status: "COMPLETED", scanStatus: "CLEAN", totalChunks: 3, sha256: sha(data) });
    expect(status.omsiFolders).toEqual(["Maps"]);
  });

  it("archív so spustiteľným súborom sa zamietne a neuloží", async () => {
    const data = await zip([["Vehicles/bus/setup.exe", "MZ"], ["Maps/a/global.cfg", "x"]]);
    await expect(upload(data, "bus.zip")).rejects.toMatchObject({ code: "REJECTED" });
  });

  it("Zip Slip (../) sa zamietne", async () => {
    const benign = await zip([["xx/evil.txt", "x"]]);
    const patched = Buffer.from(benign.toString("latin1").split("xx/evil.txt").join("../evil.txt"), "latin1");
    await expect(upload(patched, "slip.zip")).rejects.toMatchObject({ code: "REJECTED" });
  });

  it("dvojité pripojenie toho istého uploadu vytvorí iba jeden súbor", async () => {
    const { mod, version, uploaded } = await publishedModWithFile("dvojklik", await zip([["Maps/a/global.cfg", "x"]]), "PENDING_REVIEW");
    await expect(
      app.createModFileFromUpload(authorId, { uploadId: uploaded.id, modId: mod.id, versionId: version.id, kind: "OPTIONAL", displayName: "Kópia" }),
    ).rejects.toMatchObject({ code: "UPLOAD_ALREADY_ATTACHED" });
    expect(await app.db().modFile.count({ where: { modId: mod.id } })).toBe(1);
  });

  it(".dll plugin ide na manuálnu kontrolu", async () => {
    const status = await upload(await zip([["plugins/IBIS.dll", randomBytes(1000)]]), "plugin.zip");
    expect(status.scanStatus).toBe("REQUIRES_MOD_INSPECTION");
  });

  it("nepovolená prípona, cudzí Origin a neprihlásený používateľ sú odmietnutí", async () => {
    const json = { method: "POST", headers: { "content-type": "application/json" } };
    expect((await call("/api/uploads", { ...json, body: JSON.stringify({ filename: "virus.exe", sizeBytes: 10 }) })).status).toBe(400);
    expect((await call("/api/uploads", { ...json, body: "{}" }, { origin: "https://evil.example" })).status).toBe(403);
    expect((await call("/api/uploads", { ...json, body: "{}" }, { cookie: null })).status).toBe(401);
  });
});

describe("sťahovanie bez registrácie a HTTP Range", () => {
  let data: Buffer;
  let fileId: string;
  let location: string;

  beforeAll(async () => {
    data = await zip([["Sceneryobjects/Oznacnik/oznacnik.sco", "[mesh]\n"], ["Sceneryobjects/Oznacnik/tex.dds", randomBytes(1_200_000)]]);
    const created = await publishedModWithFile("oznacniky", data);
    fileId = created.file.id;
  });

  it("návštevník dostane 303 na podpísaný odkaz a celý súbor (200)", async () => {
    const res = await guestToken(fileId);
    expect(res.status).toBe(303);
    location = res.headers.get("location") ?? "";
    expect(location).toMatch(/^\/api\/download\//);
    const full = await call(location, {}, { cookie: null, ip: GUEST_IP });
    expect(full.status).toBe(200);
    expect(full.headers.get("accept-ranges")).toBe("bytes");
    expect(full.headers.get("content-length")).toBe(String(data.length));
    expect(full.headers.get("content-disposition")).toContain("attachment");
    expect(sha(Buffer.from(await full.arrayBuffer()))).toBe(sha(data));
  });

  it("Range → 206 so správnymi bajtmi, mimo rozsahu → 416", async () => {
    const part = await call(location, { headers: { range: "bytes=1000-1999" } }, { cookie: null, ip: GUEST_IP });
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe(`bytes 1000-1999/${data.length}`);
    expect(Buffer.from(await part.arrayBuffer()).equals(data.subarray(1000, 2000))).toBe(true);
    const tail = await call(location, { headers: { range: `bytes=${data.length - 500}-` } }, { cookie: null, ip: GUEST_IP });
    expect(Buffer.from(await tail.arrayBuffer()).equals(data.subarray(data.length - 500))).toBe(true);
    const bad = await call(location, { headers: { range: `bytes=${data.length}-` } }, { cookie: null, ip: GUEST_IP });
    expect(bad.status).toBe(416);
    expect(bad.headers.get("content-range")).toBe(`bytes */${data.length}`);
  });

  it("odkaz z inej IP (hotlink) a upravený token → 403", async () => {
    expect((await call(location, {}, { cookie: null, ip: "192.0.2.99" })).status).toBe(403);
    expect((await call(location.slice(0, -2) + "xx", {}, { cookie: null, ip: GUEST_IP })).status).toBe(403);
  });

  it("počítadlo je deduplikované (F5 a Range z jednej IP = 1 stiahnutie)", async () => {
    await new Promise((r) => setTimeout(r, 200));
    const file = await app.db().modFile.findUniqueOrThrow({ where: { id: fileId }, select: { downloadCount: true, mod: { select: { downloadCount: true } } } });
    expect(file.downloadCount).toBe(1);
    expect(file.mod.downloadCount).toBe(1);
  });
});

describe("moderácia", () => {
  it("mod čakajúci na schválenie je neverejný, po schválení sa dá stiahnuť", async () => {
    const created = await publishedModWithFile("cakajuci-mod", await zip([["Vehicles/Bus/model.cfg", "x"]]), "PENDING_REVIEW");
    expect((await guestToken(created.file.id)).status).toBe(404);
    const result = await app.approve(moderator, created.mod.id, "");
    expect(result).toEqual({ ok: true });
    expect((await guestToken(created.file.id)).status).toBe(303);
    const notification = await app.db().notification.findFirst({ where: { userId: authorId, type: "MOD_APPROVED" } });
    expect(notification).not.toBeNull();
  });

  it("súbor s .dll je verejne dostupný až po povolení moderátorom", async () => {
    const created = await publishedModWithFile("plugin-mod", await zip([["plugins/IBIS2.dll", randomBytes(500)]]));
    expect(created.file.scanStatus).toBe("REQUIRES_MOD_INSPECTION");
    expect((await guestToken(created.file.id)).status).toBe(404);
    expect(await app.decideFile(moderator, created.file.id, true, "Plugin skontrolovaný")).toEqual({ ok: true });
    expect((await guestToken(created.file.id)).status).toBe(303);
  });

  it("vrátenie bez komentára sa odmietne", async () => {
    const { requestChanges } = await import("@/server/admin/moderation");
    const created = await publishedModWithFile("vratit-mod", await zip([["Maps/x/global.cfg", "x"]]), "PENDING_REVIEW");
    expect(await requestChanges(moderator, created.mod.id, "")).toEqual({ ok: false, error: "COMMENT_REQUIRED" });
  });
});

describe("naplánované vydanie", () => {
  it("odomkne sa presne v čase vydania a zverejní sa práve raz", async () => {
    const created = await publishedModWithFile("naplanovany-mod", await zip([["Vehicles/Tram/model.cfg", "x"]]), "PENDING_REVIEW");
    const releaseAt = new Date(Date.now() + 1500);
    await app.db().$transaction([
      app.db().plannedRelease.create({ data: { modId: created.mod.id, mode: "EXACT_DATE", releaseAt, autoPublish: true } }),
      app.db().modVersion.update({ where: { id: created.version.id }, data: { status: "SCHEDULED", scheduledAt: releaseAt } }),
      app.db().mod.update({ where: { id: created.mod.id }, data: { status: "SCHEDULED" } }),
    ]);
    expect(await app.findDownloadableFile(created.file.id, null)).toBeNull();
    await new Promise((r) => setTimeout(r, 1700));
    expect(await app.findDownloadableFile(created.file.id, null)).not.toBeNull();
    const [a, b] = await Promise.all([app.publishDueScheduled(), app.publishDueScheduled()]);
    expect(a + b).toBe(1);
    const mod = await app.db().mod.findUniqueOrThrow({ where: { id: created.mod.id } });
    expect(mod.status).toBe("PUBLISHED");
  });
});

describe("parametre kategórie", () => {
  it("predvolené polia sa doplnia, filter katalógu a kontrola povinných polí fungujú nad DB", async () => {
    const { ensureReferenceData } = await import("@/server/mods/reference-data");
    const { searchMods } = await import("@/server/catalog");
    const { checkVersionReadiness } = await import("@/server/mods/publish");
    await ensureReferenceData(app.db());
    const fields = await app.db().categoryField.findMany({ where: { categoryId }, select: { key: true } });
    expect(fields.map((f) => f.key)).toEqual(expect.arrayContaining(["mesto", "krajina", "ai_premavka"]));

    // Úprava administrátora (vypnutie poľa) sa ďalším seedom neprepíše
    await app.db().categoryField.update({ where: { categoryId_key: { categoryId, key: "hof" } }, data: { isActive: false, labelSk: "Vlastný názov" } });
    await ensureReferenceData(app.db());
    expect(await app.db().categoryField.findUniqueOrThrow({ where: { categoryId_key: { categoryId, key: "hof" } } })).toMatchObject({ isActive: false, labelSk: "Vlastný názov" });

    const sk = await publishedModWithFile("mapa-slovensko", await zip([["Maps/sk/global.cfg", "x"]]));
    const cz = await publishedModWithFile("mapa-cesko", await zip([["Maps/cz/global.cfg", "x"]]));
    await app.db().mod.update({ where: { id: sk.mod.id }, data: { attributes: { mesto: "Žilina", krajina: "sk", ai_premavka: true } } });
    await app.db().mod.update({ where: { id: cz.mod.id }, data: { attributes: { mesto: "Brno", krajina: "cz" } } });

    const filters = { query: "", categoryId, subcategoryId: null, brandId: null, operatorId: null, without4gb: false, sort: null, page: 1 };
    const czech = await searchMods("sk", { ...filters, attributes: { krajina: "cz" } });
    expect(czech.items.map((m) => m.slug)).toEqual(["mapa-cesko"]);
    const withAi = await searchMods("sk", { ...filters, attributes: { krajina: "sk", ai_premavka: true } });
    expect(withAi.items.map((m) => m.slug)).toEqual(["mapa-slovensko"]);

    // Filter „Funguje v openOMSI“ – iba WORKS a EXCLUSIVE, nie PARTIAL ani neoverené
    await app.db().mod.update({ where: { id: sk.mod.id }, data: { openOmsi: "WORKS" } });
    await app.db().mod.update({ where: { id: cz.mod.id }, data: { openOmsi: "PARTIAL" } });
    const openOmsi = await searchMods("sk", { ...filters, openOmsi: true });
    expect(openOmsi.items.map((m) => m.slug)).toEqual(["mapa-slovensko"]);
    expect(openOmsi.items[0]?.openOmsi).toBe("WORKS");

    // Mapa bez povinného mesta neprejde kontrolou pred odoslaním novej verzie
    const draft = await app.db().modVersion.create({ data: { modId: cz.mod.id, version: "1.1.0", status: "DRAFT" } });
    await app.db().mod.update({ where: { id: cz.mod.id }, data: { attributes: { krajina: "cz" } } });
    expect(await checkVersionReadiness(cz.mod.id, draft.id)).toContain("ATTRIBUTES_MISSING");
  });
});
