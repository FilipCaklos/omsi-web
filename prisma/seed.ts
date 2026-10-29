/**
 * Ukážkové dáta OMSI Depo – spúšťa `npx prisma db seed` (v Dockeri služba `migrate`, ak SEED_DEMO_DATA=true).
 *
 * Generuje SKUTOČNÉ súbory: ZIP archívy s OMSI 2 štruktúrou, HOF a PDF. Každý prejde rovnakou kontrolou
 * ako upload (magic bytes, obsah archívu, SHA-256) a uloží sa do úložiska – po spustení sa dajú hneď stiahnuť.
 * Seed je idempotentný: ak už existuje účet „spravca“, nič nemení.
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import yazl from "yazl";
import type { FileKind, Prisma } from "../src/generated/prisma/client";
import { db } from "../src/lib/db";
import { env } from "../src/lib/env";
import { localDateTimeToUtc } from "../src/lib/timezone";
import { MOD_FILE_MIME, type ModFileExtension } from "../src/lib/upload-policy";
import { inspectFile } from "../src/server/inspection/inspect";
import { renderMarkdown } from "../src/server/markdown";
import { refreshSearchExtra } from "../src/server/mods/helpers";
import { publishVersion } from "../src/server/mods/publish";
import { ensureReferenceData } from "../src/server/mods/reference-data";
import { hashPassword } from "../src/server/security/password";
import { newFileKey, newImageKeys, storage } from "../src/server/storage";

const DAY = 86_400_000;

/** Testovacie účty – zoznam aj s heslami je v README.md. Pred produkciou ich zmeňte alebo zmažte. */
export const SEED_ACCOUNTS = [
  { username: "spravca", name: "Správca Depa", email: "admin@omsi-depo.local", password: "Depo-Spravca-2026", role: "ADMIN" },
  { username: "dispecer", name: "Dispečer Moderátor", email: "moderator@omsi-depo.local", password: "Depo-Dispecer-2026", role: "MODERATOR" },
  { username: "lubo.mapy", name: "Ľubo Mapár", email: "autor@omsi-depo.local", password: "Depo-Mapar-2026", role: "VERIFIED_CREATOR" },
  { username: "vodic.jano", name: "Jano z Petržalky", email: "vodic@omsi-depo.local", password: "Depo-Vodic-2026", role: "USER" },
] as const;

/** Deterministické „náhodné“ bajty – rovnaký seed dá rovnaké SHA-256. */
function bytes(label: string, size: number): Buffer {
  const out = Buffer.alloc(size);
  let block = createHash("sha256").update(label).digest();
  for (let offset = 0; offset < size; offset += block.length) {
    block.copy(out, offset);
    block = createHash("sha256").update(block).digest();
  }
  return out;
}

function zip(entries: [string, Buffer | string][]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = new yazl.ZipFile();
    for (const [name, data] of entries) archive.addBuffer(Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8"), name);
    archive.end();
    const chunks: Buffer[] = [];
    archive.outputStream.on("data", (c: Buffer) => chunks.push(c)).on("end", () => resolve(Buffer.concat(chunks))).on("error", reject);
  });
}

/** Malé, ale platné PDF s návodom (jedna strana, text). */
function pdf(title: string, lines: string[]): Buffer {
  const text = [title, ...lines].map((l, i) => `BT /F1 ${i === 0 ? 18 : 11} Tf 50 ${780 - i * 22} Td (${l.replace(/[()\\]/g, "")}) Tj ET`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

let workDir = "";
const SEED_MARKER = "seed.demo";

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c] as string);
}

type FileSpec = { kind: FileKind; name: string; filename: string; data: Buffer; description?: string; mirrorUrl?: string; mirrorLabel?: string; patchFor?: string };

/** Súbor prejde rovnakou kontrolou ako upload a uloží sa do úložiska. */
async function addFile(modId: string, versionId: string, uploaderId: string, spec: FileSpec, sortOrder: number) {
  const extension = spec.filename.split(".").pop()?.toLowerCase() as ModFileExtension;
  const temp = path.join(workDir, `${Date.now()}-${sortOrder}-${spec.filename.replace(/[^a-z0-9.]/gi, "_")}`);
  await writeFile(temp, spec.data);
  const result = await inspectFile(temp, extension, {
    sevenZipPath: env().SEVEN_ZIP_PATH,
    maxEntries: env().ARCHIVE_MAX_ENTRIES,
    maxUncompressedBytes: env().ARCHIVE_MAX_UNCOMPRESSED_BYTES,
  });
  if (result.verdict === "REJECTED") throw new Error(`Seed súbor ${spec.filename} neprešiel kontrolou: ${JSON.stringify(result.findings)}`);
  const key = newFileKey(extension);
  await storage().putFile(key, temp, MOD_FILE_MIME[extension]);
  return db().modFile.create({
    data: {
      modId,
      versionId,
      kind: spec.kind,
      displayName: spec.name,
      description: spec.description ?? "",
      originalFilename: spec.filename,
      extension,
      mimeType: MOD_FILE_MIME[extension],
      sizeBytes: BigInt(spec.data.length),
      sha256: result.sha256,
      storageDriver: env().STORAGE_DRIVER,
      storageKey: key,
      archiveFormat: result.archiveFormat,
      archiveEntries: result.entries ?? undefined,
      archiveEntryCount: result.entryCount,
      archiveUncompressedBytes: result.uncompressedBytes === null ? null : BigInt(result.uncompressedBytes),
      omsiFolders: result.omsiFolders,
      scanStatus: result.verdict,
      scanNotes: { findings: result.findings, installPrefix: result.installPrefix, entriesTruncated: result.entriesTruncated } satisfies Prisma.InputJsonObject,
      mirrorUrl: spec.mirrorUrl ?? null,
      mirrorLabel: spec.mirrorLabel ?? null,
      patchForFileId: spec.patchFor ?? null,
      sortOrder,
      uploaderId,
    },
  });
}

/** Screenshot 16:9 (SVG → JPEG → rovnaké spracovanie ako pri uploade: WebP, bez metadát). */
async function addImage(ownerId: string, target: { modId?: string; devlogId?: string }, title: string, colors: [string, string], sortOrder: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">
    <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${colors[0]}"/><stop offset="1" stop-color="#1b1f26"/></linearGradient></defs>
    <rect width="1920" height="1080" fill="url(#sky)"/>
    <rect y="760" width="1920" height="320" fill="#2b2f36"/><rect y="900" width="1920" height="10" fill="#e8e8e8"/>
    <rect x="360" y="470" width="1200" height="330" rx="28" fill="${colors[1]}"/>
    <rect x="420" y="520" width="900" height="140" rx="10" fill="#9fc3d9"/>
    <rect x="1360" y="520" width="150" height="230" rx="8" fill="#9fc3d9"/>
    <rect x="430" y="490" width="380" height="22" rx="4" fill="#0b0d10"/><text x="445" y="508" font-size="18" font-family="monospace" fill="#f59e0b">${escapeXml(title.slice(0, 28))}</text>
    <circle cx="560" cy="810" r="70" fill="#111"/><circle cx="1360" cy="810" r="70" fill="#111"/>
  </svg>`;
  const input = await sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
  const base = sharp(input).rotate();
  const full = await base.clone().resize({ width: 2560, height: 1440, fit: "inside", withoutEnlargement: true }).webp({ quality: 86 }).toBuffer({ resolveWithObject: true });
  const thumb = await base.clone().resize({ width: 640, height: 360, fit: "cover" }).webp({ quality: 78 }).toBuffer();
  const keys = newImageKeys();
  await storage().putBuffer(keys.thumb, thumb, "image/webp");
  await storage().putBuffer(keys.full, full.data, "image/webp");
  return db().mediaImage.create({
    data: {
      kind: target.devlogId ? "DEVLOG" : "SCREENSHOT",
      ownerId,
      modId: target.modId ?? null,
      devlogId: target.devlogId ?? null,
      storageKey: keys.thumb,
      fullKey: keys.full,
      storageDriver: env().STORAGE_DRIVER,
      width: full.info.width,
      height: full.info.height,
      sizeBytes: full.data.length,
      sortOrder,
      isPrimary: Boolean(target.modId) && sortOrder === 0,
    },
  });
}

async function ids() {
  const [categories, subcategories, brands, operators, dlcs] = await Promise.all([
    db().category.findMany({ select: { id: true, slug: true } }),
    db().subcategory.findMany({ select: { id: true, slug: true, category: { select: { slug: true } } } }),
    db().vehicleBrand.findMany({ select: { id: true, slug: true } }),
    db().operator.findMany({ select: { id: true, slug: true } }),
    db().steamDlc.findMany({ select: { id: true, slug: true } }),
  ]);
  const pick = <T extends { slug: string; id: string }>(list: T[], slug: string) => {
    const found = list.find((x) => x.slug === slug);
    if (!found) throw new Error(`Chýba číselník ${slug}`);
    return found.id;
  };
  return {
    category: (slug: string) => pick(categories, slug),
    sub: (category: string, slug: string) => {
      const found = subcategories.find((s) => s.slug === slug && s.category.slug === category);
      if (!found) throw new Error(`Chýba podkategória ${category}/${slug}`);
      return found.id;
    },
    brand: (slug: string) => pick(brands, slug),
    operator: (slug: string) => pick(operators, slug),
    dlc: (slug: string) => pick(dlcs, slug),
  };
}

type ModInput = {
  slug: string;
  title: string;
  summary: string;
  description: string;
  categoryId: string;
  subcategoryId?: string;
  authorId: string;
  vehicleModel?: string;
  /** Parametre kategórie (kľúče z CATEGORY_FIELDS) */
  attributes?: Record<string, string | number | boolean | string[]>;
  openOmsi?: "UNTESTED" | "WORKS" | "PARTIAL" | "NOT_WORKING" | "EXCLUSIVE";
  location?: { lat: number; lng: number };
  tags?: string[];
  brands?: string[];
  operators?: string[];
  requires4gb?: boolean;
  status?: "DRAFT" | "PLANNED" | "SCHEDULED" | "PENDING_REVIEW";
  colors: [string, string];
  screenshots?: number;
};

async function createMod(input: ModInput) {
  const mod = await db().mod.create({
    data: {
      slug: input.slug,
      title: input.title,
      summary: input.summary,
      description: input.description,
      descriptionHtml: renderMarkdown(input.description),
      categoryId: input.categoryId,
      subcategoryId: input.subcategoryId ?? null,
      authorId: input.authorId,
      vehicleModel: input.vehicleModel ?? null,
      attributes: input.attributes ?? {},
      openOmsi: input.openOmsi ?? "UNTESTED",
      mapLat: input.location?.lat ?? null,
      mapLng: input.location?.lng ?? null,
      tags: input.tags ?? [],
      requires4GbPatch: input.requires4gb ?? false,
      status: input.status ?? "DRAFT",
      licenseTerms: ["NO_REUPLOAD", "MODIFY_WITH_PERMISSION", "CREDIT_REQUIRED"],
      brands: { create: (input.brands ?? []).map((brandId) => ({ brandId })) },
      operators: { create: (input.operators ?? []).map((operatorId) => ({ operatorId })) },
    },
  });
  for (let i = 0; i < (input.screenshots ?? 2); i += 1) await addImage(input.authorId, { modId: mod.id }, input.title, input.colors, i);
  await refreshSearchExtra(mod.id);
  return mod;
}

/** Zverejnenie verzie so súbormi cez rovnakú logiku ako vo webe + spätné nastavenie dátumu pre realistický katalóg. */
async function release(modId: string, authorId: string, version: string, changelog: string, files: FileSpec[], daysAgo: number) {
  const v = await db().modVersion.create({ data: { modId, version, changelog, changelogHtml: renderMarkdown(changelog), status: "DRAFT" } });
  const created = [];
  for (const [i, spec] of files.entries()) created.push(await addFile(modId, v.id, authorId, spec, i));
  await publishVersion(v.id, authorId);
  const at = new Date(Date.now() - daysAgo * DAY);
  await db().modVersion.update({ where: { id: v.id }, data: { publishedAt: at } });
  const mod = await db().mod.findUniqueOrThrow({ where: { id: modId }, select: { publishedAt: true } });
  await db().mod.update({
    where: { id: modId },
    data: { lastUpdatedAt: at, publishedAt: mod.publishedAt && mod.publishedAt.getTime() < at.getTime() && version !== "1.0.0" ? mod.publishedAt : at },
  });
  return { version: v, files: created };
}

async function downloads(modId: string, fileId: string, total: number, lastWeek: number, userIds: string[]) {
  await db().mod.update({ where: { id: modId }, data: { downloadCount: { increment: total } } });
  await db().modFile.update({ where: { id: fileId }, data: { downloadCount: { increment: total } } });
  await db().downloadEvent.createMany({
    data: Array.from({ length: lastWeek }, (_, i) => ({
      modId,
      fileId,
      userId: userIds[i % userIds.length] ?? null,
      ipHash: createHash("sha256").update(`seed-ip-${modId}-${i}`).digest("hex"),
      createdAt: new Date(Date.now() - ((i * 37) % 7) * DAY - i * 60_000),
    })),
  });
}

async function main() {
  if (process.env.SEED_DEMO_DATA === "false") {
    console.info("[seed] SEED_DEMO_DATA=false – doplním iba číselníky.");
    await ensureReferenceData(db());
    return;
  }
  await ensureReferenceData(db());
  if (await db().systemSetting.findUnique({ where: { key: SEED_MARKER } })) {
    console.info("[seed] Ukážkové dáta už existujú – preskakujem.");
    return;
  }
  if (await db().user.findUnique({ where: { username: "spravca" }, select: { id: true } })) {
    throw new Error("Predošlý seed skončil v polovici. Vyčisti databázu (npx prisma migrate reset) a spusti seed znova.");
  }
  workDir = await mkdtemp(path.join(tmpdir(), "omsi-seed-"));
  const ref = await ids();

  // ── Účty (heslo Argon2id ako pri registrácii) ──
  const users: Record<string, string> = {};
  for (const account of SEED_ACCOUNTS) {
    const user = await db().user.create({
      data: {
        username: account.username,
        name: account.name,
        email: account.email,
        emailVerified: true,
        role: account.role,
        bio: account.role === "VERIFIED_CREATOR" ? "Mapujem slovenské prímestské linky a staré Karosy." : null,
        accounts: { create: { providerId: "credential", accountId: account.username, password: await hashPassword(account.password) } },
      },
    });
    await db().account.updateMany({ where: { userId: user.id }, data: { accountId: user.id } });
    users[account.username] = user.id;
  }
  const author = users["lubo.mapy"] as string;
  const driver = users["vodic.jano"] as string;
  const admin = users["spravca"] as string;

  // ── 1) Objekty – závislosť pre mapu ──
  const objects = await createMod({
    slug: "ceskoslovenske-oznacniky-zastavok",
    title: "Československé označníky zastávok",
    summary: "Balík zastávkových označníkov SAD, ČSAD, DPB a DPP vrátane tabuliek CP a prístreškov.",
    description: "## Obsah\n\n- 48 označníkov (SAD, ČSAD, mestské MHD)\n- Prístrešky Mabeg a betónové\n- Tabule s cestovnými poriadkami\n\nPotrebné pre mapy **Pezinok – Modra** a **Žilina – Vlčince**.",
    categoryId: ref.category("objekty-splines"),
    subcategoryId: ref.sub("objekty-splines", "oznacniky"),
    attributes: { styl: "univerzalny", pocet: 24 },
    authorId: author,
    tags: ["oznacniky", "sad", "csad"],
    colors: ["#5a7a9a", "#d8d8d8"],
  });
  const objectsRelease = await release(objects.id, author, "1.0.0", "Prvé vydanie.", [
    {
      kind: "MAIN", name: "Hlavný súbor", filename: "CS_Oznacniky_v1.0.zip",
      data: await zip([
        ["Sceneryobjects/CS_Oznacniky/SAD_oznacnik.sco", "[mesh]\nSAD_oznacnik.o3d\n"],
        ["Sceneryobjects/CS_Oznacniky/model/SAD_oznacnik.o3d", bytes("sad-o3d", 180_000)],
        ["Sceneryobjects/CS_Oznacniky/texture/SAD_oznacnik.dds", bytes("sad-dds", 350_000)],
        ["Sceneryobjects/CS_Oznacniky/DPB_oznacnik.sco", "[mesh]\nDPB_oznacnik.o3d\n"],
        ["Sceneryobjects/CS_Oznacniky/texture/DPB_oznacnik.dds", bytes("dpb-dds", 300_000)],
      ]),
    },
  ], 40);

  // ── 2) Mapa: hlavný súbor + HOF + PDF, neskôr patch 1.0.2 ──
  const map = await createMod({
    slug: "pezinok-modra-harmonia",
    title: "Pezinok – Modra – Harmónia",
    summary: "Prímestská mapa SAD liniek Pezinok – Modra – Harmónia s BUSE HOF, hláseniami a AI premávkou.",
    description: "## Inštalácia\n\n1. Rozbaľ obsah priečinka z archívu do koreňa **OMSI 2**.\n2. Nainštaluj [Československé označníky zastávok](/mod/ceskoslovenske-oznacniky-zastavok).\n3. Aplikuj **4GB Patch**.\n\n| Linka | Trasa |\n|---|---|\n| 101 | Pezinok, AS – Modra, nám. |\n| 102 | Pezinok, AS – Modra-Harmónia |\n\nCestovné poriadky podľa stavu 2024.",
    categoryId: ref.category("mapy"),
    subcategoryId: ref.sub("mapy", "realne-cz-sk"),
    attributes: { mesto: "Pezinok – Modra", krajina: "sk", linky: 6, obdobie: "2010–2015", ai_premavka: true, hof: true },
    openOmsi: "WORKS",
    location: { lat: 48.287, lng: 17.267 },
    authorId: author,
    tags: ["sad", "buse", "primestska", "malokarpatsko"],
    operators: [ref.operator("sad")],
    requires4gb: true,
    colors: ["#7fa7c9", "#e3a32c"],
    screenshots: 3,
  });
  await db().modDependency.create({ data: { modId: map.id, kind: "INTERNAL_MOD", required: true, targetModId: objects.id } });
  await db().modCredit.createMany({
    data: [
      { modId: map.id, name: "Ľubo Mapár", role: "MAP", userId: author, sortOrder: 0 },
      { modId: map.id, name: "Peťo zo Senca", role: "HOF", sortOrder: 1 },
      { modId: map.id, name: "Jano z Petržalky", role: "TESTING", userId: driver, sortOrder: 2 },
    ],
  });
  const mapMain = await release(map.id, author, "1.0.0", "Prvé vydanie mapy.", [
    {
      kind: "MAIN", name: "Hlavný súbor", filename: "Pezinok-Modra-Harmonia v1.0.zip",
      mirrorUrl: "https://mega.nz/folder/omsi-depo-ukazka", mirrorLabel: "Mega",
      data: await zip([
        ["Pezinok - Modra v1.0/Maps/Pezinok - Modra/global.cfg", "[name]\nPezinok – Modra – Harmónia\n[version]\n1.0\n"],
        ["Pezinok - Modra v1.0/Maps/Pezinok - Modra/tile_0_0.map", bytes("tile-0-0", 1_500_000)],
        ["Pezinok - Modra v1.0/Maps/Pezinok - Modra/tile_0_1.map", bytes("tile-0-1", 1_200_000)],
        ["Pezinok - Modra v1.0/Maps/Pezinok - Modra/TTData/101.ttp", "[trip]\n101\nPezinok, AS\n"],
        ["Pezinok - Modra v1.0/Splines/SK_Cesty/cesta_2pruh.sli", bytes("spline", 220_000)],
        ["Pezinok - Modra v1.0/Vehicles/Announcements/SAD_PK/Pezinok_AS.wav", bytes("wav", 160_000)],
        ["Pezinok - Modra v1.0/ReadMe.txt", "Rozbaľte obsah do priečinka OMSI 2. Vyžaduje 4GB Patch.\n"],
      ]),
    },
    { kind: "OPTIONAL", name: "BUSE HOF – SAD Pezinok", filename: "SAD Pezinok.hof", data: Buffer.from("[name]\nSAD Pezinok\n\n[addterminus_list]\n0\n101\nPezinok, AS\n", "latin1") },
    { kind: "OPTIONAL", name: "Manuál a mapa liniek (PDF)", filename: "Pezinok-Modra manual.pdf", data: pdf("Pezinok - Modra - Harmonia", ["Linka 101: Pezinok, AS - Modra, nam.", "Linka 102: Pezinok, AS - Modra-Harmonia", "IBIS kody: 101 = 1010, 102 = 1020"]) },
  ], 20);
  const mainFileId = mapMain.files[0]?.id as string;
  await release(map.id, author, "1.0.2", "- Opravený chýbajúci spline pri zastávke Modra, nám.\n- Upravené časy liniek 102.", [
    {
      kind: "PATCH", name: "Opravný patch 1.0.2", filename: "Pezinok-Modra patch 1.0.2.zip", patchFor: mainFileId,
      description: "Iba opravené súbory (~300 kB) – nainštaluj po hlavnom súbore.",
      data: await zip([
        ["Maps/Pezinok - Modra/tile_0_1.map", bytes("tile-0-1-fix", 250_000)],
        ["Splines/SK_Cesty/cesta_2pruh_oprava.sli", bytes("spline-fix", 40_000)],
      ]),
    },
  ], 2);
  await db().mod.update({ where: { id: map.id }, data: { isFeatured: true } });

  // ── 3) Repainty Karosa + SOR ──
  const repaints = await createMod({
    slug: "karosa-sor-repainty-dpb-dpmk",
    title: "Karosa B 732 & SOR NB 12 – repainty DPB a DPMK",
    summary: "12 repaintov mestských autobusov Bratislavy a Košíc vrátane historických náterov.",
    description: "Repainty pre freeware Karosu B 732 a SOR NB 12. Nainštaluj **po** samotných vozidlách.",
    categoryId: ref.category("repainty"),
    subcategoryId: ref.sub("repainty", "autobusy"),
    attributes: { pre_vozidlo: "Karosa B 732, SOR NB 12", pocet: 8, obdobie: "1995–2010" },
    authorId: author,
    vehicleModel: "B 732, NB 12",
    brands: [ref.brand("karosa"), ref.brand("sor")],
    operators: [ref.operator("dpb"), ref.operator("dpmk")],
    tags: ["repaint", "dpb", "dpmk"],
    colors: ["#c0392b", "#f1c40f"],
  });
  const repaintRelease = await release(repaints.id, author, "2.1", "Pridané 4 košické nátery.", [
    {
      kind: "MAIN", name: "Hlavný súbor", filename: "Repainty DPB DPMK 2.1.zip",
      data: await zip([
        ["Vehicles/Karosa_B732/Texture/DPB_1234.dds", bytes("dpb-1234", 400_000)],
        ["Vehicles/Karosa_B732/Texture/DPB_1234.dds.cfg", "[matl]\nDPB_1234.dds\n"],
        ["Vehicles/SOR_NB12/Texture/DPMK_1902.dds", bytes("dpmk-1902", 420_000)],
      ]),
    },
  ], 6);

  // ── 4) Skripty a zvuky + OMSI plugin čakajúci na manuálnu kontrolu (.dll) ──
  const scripts = await createMod({
    slug: "odbavovaci-system-emtest-zvuky-karosa",
    title: "Odbavovací systém EMTEST + zvuky Karosa",
    summary: "Skripty kasy EMTEST s tarifami SK/CZ a zvukový balík motora LIAZ pre Karosu B 732.",
    description: "Obsahuje skripty kasy a zvuky. Voliteľný IBIS plugin (.dll) čaká na kontrolu moderátorom.",
    categoryId: ref.category("skripty-zvuky"),
    subcategoryId: ref.sub("skripty-zvuky", "odbavovacie-systemy"),
    attributes: { pre_vozidlo: "Karosa B 732, B 931", prepisuje: true },
    openOmsi: "PARTIAL",
    authorId: author,
    brands: [ref.brand("karosa")],
    tags: ["kasa", "emtest", "liaz"],
    colors: ["#2c3e50", "#95a5a6"],
  });
  await release(scripts.id, author, "1.3.1", "Opravené zaokrúhľovanie cien.", [
    {
      kind: "MAIN", name: "Hlavný súbor", filename: "EMTEST_Karosa_1.3.1.zip",
      data: await zip([
        ["Vehicles/Karosa_B732/Script/emtest.osc", "' EMTEST odbavovaci system\n{macro:Emtest_Init}\n{end}\n"],
        ["Vehicles/Karosa_B732/Sound/liaz_motor.wav", bytes("liaz", 600_000)],
        ["TicketPacks/SK_Tarify/tickets.cfg", "[ticket]\nZakladny\n"],
      ]),
    },
    {
      kind: "OPTIONAL", name: "IBIS2 plugin (DLL)", filename: "IBIS2 plugin.zip",
      data: await zip([["plugins/IBIS2.dll", bytes("dll", 30_000)], ["plugins/IBIS2.opl", "[dll]\nIBIS2.dll\n"]]),
    },
  ], 10);

  // ── 5) Nový mod od bežného používateľa – čaká v schvaľovacej fronte ──
  const pending = await createMod({
    slug: "irisbus-crossway-le-csad-repaint",
    title: "Irisbus Crossway LE – repaint ČSAD",
    summary: "Repaint ČSAD pre Iveco Crossway LE z oficiálneho DLC.",
    description: "Prvý repaint, prosím o spätnú väzbu.",
    categoryId: ref.category("repainty"),
    subcategoryId: ref.sub("repainty", "autobusy"),
    attributes: { pre_vozidlo: "Iveco Crossway LE (DLC)", pocet: 3 },
    authorId: driver,
    brands: [ref.brand("irisbus-iveco")],
    operators: [ref.operator("csad")],
    colors: ["#e67e22", "#ecf0f1"],
    screenshots: 1,
  });
  const pendingVersion = await db().modVersion.create({ data: { modId: pending.id, version: "1.0", status: "DRAFT" } });
  await addFile(pending.id, pendingVersion.id, driver, {
    kind: "MAIN", name: "Hlavný súbor", filename: "Crossway CSAD.zip",
    data: await zip([["Vehicles/Iveco_Crossway_LE/Texture/CSAD_TN.dds", bytes("csad", 300_000)]]),
  }, 0);
  await db().modDependency.create({ data: { modId: pending.id, kind: "STEAM_DLC", required: true, steamDlcId: ref.dlc("iveco-crossway-le") } });
  await db().modVersion.update({ where: { id: pendingVersion.id }, data: { status: "PENDING_REVIEW" } });
  await db().mod.update({ where: { id: pending.id }, data: { status: "PENDING_REVIEW" } });

  // ── 6) Pripravované: presný dátum o 4 dni 18:00, súbory nahraté → automatické vydanie ──
  const releaseDay = new Date(Date.now() + 4 * DAY);
  const dateStr = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Bratislava" }).format(releaseDay);
  const releaseAt = localDateTimeToUtc(`${dateStr}T18:00`) as Date;
  const trolley = await createMod({
    slug: "skoda-31tr-sor-bratislava",
    title: "Škoda 31Tr SOR – Bratislava",
    summary: "Kĺbový trolejbus Škoda 31Tr SOR v nátere DPB so zvukmi, BUSE panelmi a kasou.",
    description: "## Projekt\n\nTrolejbus pre mapy Bratislavy. Vydanie sa odomkne **automaticky** v čase odpočtu.",
    categoryId: ref.category("trolejbusy-elektricky"),
    subcategoryId: ref.sub("trolejbusy-elektricky", "trolejbusy"),
    attributes: { podlaha: "nizkopodlazny", clanky: 1, roky_vyroby: "2014–2016" },
    authorId: author,
    brands: [ref.brand("skoda"), ref.brand("sor")],
    operators: [ref.operator("dpb")],
    vehicleModel: "31Tr SOR",
    status: "SCHEDULED",
    colors: ["#7a1f1f", "#d9d9d9"],
  });
  await db().plannedRelease.create({
    data: {
      modId: trolley.id, mode: "EXACT_DATE", releaseAt, autoPublish: true,
      progress: { create: [
        { label: "3D model", percent: 100, sortOrder: 0 }, { label: "Textúry", percent: 100, sortOrder: 1 },
        { label: "Skripty & kasa", percent: 95, sortOrder: 2 }, { label: "Zvuky", percent: 90, sortOrder: 3 }, { label: "Betatest", percent: 80, sortOrder: 4 },
      ] },
    },
  });
  const scheduledVersion = await db().modVersion.create({ data: { modId: trolley.id, version: "1.0.0", status: "SCHEDULED", scheduledAt: releaseAt, changelog: "Prvé vydanie." } });
  await addFile(trolley.id, scheduledVersion.id, author, {
    kind: "MAIN", name: "Hlavný súbor", filename: "Skoda 31Tr SOR 1.0.zip",
    data: await zip([["Vehicles/Skoda_31Tr/model/model.cfg", "[mesh]\nbody.o3d\n"], ["Vehicles/Skoda_31Tr/model/body.o3d", bytes("31tr", 900_000)]]),
  }, 0);
  const devlog1 = await db().devlog.create({
    data: { modId: trolley.id, authorId: author, title: "Hotový interiér a BUSE panel", body: "Interiér je **hotový**, BUSE panel zobrazuje linky 201 a 202.", bodyHtml: renderMarkdown("Interiér je **hotový**, BUSE panel zobrazuje linky 201 a 202."), createdAt: new Date(Date.now() - 9 * DAY) },
  });
  await addImage(author, { devlogId: devlog1.id }, "Interier 31Tr", ["#3d4a5c", "#8a2a2a"], 0);
  await db().devlog.create({
    data: { modId: trolley.id, authorId: author, title: "Betatest a dátum vydania", body: "Betatest beží, vydanie je naplánované – súbory sú pripravené.", bodyHtml: renderMarkdown("Betatest beží, vydanie je naplánované – súbory sú pripravené."), createdAt: new Date(Date.now() - 1 * DAY) },
  });

  // ── 7) Pripravované: orientačné obdobie ──
  const now = new Date();
  const zilina = await createMod({
    slug: "zilina-vlcince-dpmz",
    title: "Žilina – Vlčince (DPmŽ)",
    summary: "Reálna mapa trolejbusových a autobusových liniek DPmŽ na sídlisku Vlčince.",
    description: "Rozpracovaná mapa, betatest po dokončení stavby trate.",
    categoryId: ref.category("mapy"),
    subcategoryId: ref.sub("mapy", "realne-cz-sk"),
    attributes: { mesto: "Žilina", krajina: "sk", linky: 4, ai_premavka: true },
    location: { lat: 49.236, lng: 18.73 },
    authorId: author,
    operators: [ref.operator("dpmz")],
    status: "PLANNED",
    colors: ["#4b6584", "#26de81"],
  });
  await db().plannedRelease.create({
    data: {
      modId: zilina.id, mode: "WINDOW", windowYear: now.getUTCFullYear(), windowPart: "WINTER",
      progress: { create: [{ label: "Stavba mapy", percent: 80, sortOrder: 0 }, { label: "Splines a objekty", percent: 70, sortOrder: 1 }, { label: "Cestovné poriadky", percent: 40, sortOrder: 2 }] },
    },
  });
  await db().devlog.create({ data: { modId: zilina.id, authorId: author, title: "Trolejové vedenie na Hlinkovom námestí", body: "Hotové trolejové vedenie a križovatka.", bodyHtml: renderMarkdown("Hotové trolejové vedenie a križovatka.") } });

  // ── 8) Pripravované: TBA ──
  const tatra = await createMod({
    slug: "tatra-t3-kosice",
    title: "Tatra T3 – Košice",
    summary: "Električka Tatra T3SUCS v košických náteroch – dlhodobý projekt bez dátumu vydania.",
    description: "Projekt robíme vo voľnom čase.",
    categoryId: ref.category("trolejbusy-elektricky"),
    subcategoryId: ref.sub("trolejbusy-elektricky", "elektricky"),
    attributes: { podlaha: "vysokopodlazny", clanky: 1, roky_vyroby: "1980–1997" },
    authorId: author,
    brands: [ref.brand("tatra"), ref.brand("ckd")],
    operators: [ref.operator("dpmk")],
    status: "PLANNED",
    colors: ["#e1b12c", "#c23616"],
  });
  await db().plannedRelease.create({
    data: { modId: tatra.id, mode: "TBA", noEtaQuestions: true, progress: { create: [{ label: "3D model", percent: 60, sortOrder: 0 }, { label: "Textúry", percent: 30, sortOrder: 1 }, { label: "Skripty", percent: 10, sortOrder: 2 }] } },
  });

  // ── Komunita: sledovanie, recenzie, chyby, stiahnutia, nahlásenie ──
  await db().follow.createMany({ data: [{ userId: driver, modId: trolley.id }, { userId: driver, modId: zilina.id }, { userId: admin, modId: trolley.id }] });
  for (const modId of [trolley.id, zilina.id]) {
    await db().mod.update({ where: { id: modId }, data: { followerCount: await db().follow.count({ where: { modId } }) } });
  }
  const reviewBody = "Výborná mapa, AI premávka funguje a HOF je presný. Odporúčam nainštalovať aj označníky.";
  await db().review.create({ data: { modId: map.id, userId: driver, rating: 5, body: reviewBody, bodyHtml: renderMarkdown(reviewBody) } });
  await db().review.create({ data: { modId: repaints.id, userId: driver, rating: 4, body: "Pekné nátery, chýba mi ešte DPB 1990.", bodyHtml: renderMarkdown("Pekné nátery, chýba mi ešte DPB 1990.") } });
  for (const modId of [map.id, repaints.id]) {
    const agg = await db().review.aggregate({ where: { modId }, _avg: { rating: true }, _count: { _all: true } });
    await db().mod.update({ where: { id: modId }, data: { ratingAvg: agg._avg.rating ?? 0, ratingCount: agg._count._all } });
  }
  const bugText = "Na linke 102 pri zastávke Modra-Harmónia bus prepadne pod terén.";
  await db().bugReport.create({
    data: {
      modId: map.id, reporterId: driver, title: "Bus padá pod terén pri Harmónii", description: bugText, descriptionHtml: renderMarkdown(bugText),
      logfile: "14:02:11 - - Error:   Spline not found: Splines\\SK_Cesty\\cesta_3pruh.sli\n14:02:11 - - Error:   Tile 0_1 could not load object", omsiVersion: "2.3.004", status: "FIXED", fixedInVersion: "1.0.2",
    },
  });
  await downloads(map.id, mainFileId, 1284, 46, [driver]);
  await downloads(repaints.id, repaintRelease.files[0]?.id as string, 532, 21, [driver]);
  await downloads(objects.id, objectsRelease.files[0]?.id as string, 2210, 33, [driver]);
  await db().report.create({ data: { reporterId: driver, targetType: "MOD", modId: repaints.id, reason: "MISSING_CREDITS", details: "V popise chýba autor pôvodného modelu SOR NB 12." } });

  await db().systemSetting.create({ data: { key: SEED_MARKER, value: { completedAt: new Date().toISOString() } } });
  console.info(`[seed] Hotovo: ${SEED_ACCOUNTS.length} účty, 8 modifikácií (3 pripravované), súbory v úložisku ${env().STORAGE_DRIVER}.`);
}

main()
  .catch((error) => {
    console.error("[seed] Zlyhalo:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (workDir) await rm(workDir, { recursive: true, force: true });
    await db().$disconnect();
  });
