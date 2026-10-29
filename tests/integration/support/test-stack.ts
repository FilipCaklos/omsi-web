import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import RedisMock from "ioredis-mock";

const ROOT = path.resolve(__dirname, "../../..");

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => (typeof address === "object" && address ? resolve(address.port) : reject(new Error("port"))));
    });
  });
}

/**
 * Izolovaná testovacia infraštruktúra bez Dockeru: skutočný PostgreSQL (PGlite, WASM) so všetkými migráciami
 * vrátane unaccent/pg_trgm, Redis (ioredis-mock) a dočasné úložisko súborov.
 * Musí sa zavolať PRED prvým importom aplikačných modulov (konfigurácia sa číta lenivo).
 */
export async function startTestStack() {
  const pg = await PGlite.create({ extensions: { pg_trgm, unaccent } });
  const migrationsDir = path.join(ROOT, "prisma/migrations");
  for (const dir of readdirSync(migrationsDir).filter((d) => /^\d+_/.test(d)).sort()) {
    await pg.exec(readFileSync(path.join(migrationsDir, dir, "migration.sql"), "utf8"));
  }
  const port = await freePort();
  const server = new PGLiteSocketServer({ db: pg, port, host: "127.0.0.1" });
  await server.start();
  const storageRoot = mkdtempSync(path.join(tmpdir(), "omsi-test-storage-"));

  Object.assign(process.env, {
    NODE_ENV: "test",
    APP_URL: "http://localhost:3000",
    DATABASE_URL: `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`,
    DATABASE_POOL_MAX: "1",
    STORAGE_LOCAL_ROOT: storageRoot,
    UPLOAD_CHUNK_BYTES: String(1024 * 1024),
    SEVEN_ZIP_PATH: "7zz-v-testoch-nie-je",
    SMTP_PORT: "9",
  });
  (globalThis as { redis?: unknown }).redis = new RedisMock();

  return {
    storageRoot,
    async stop() {
      const { db } = await import("@/lib/db");
      await db().$disconnect();
      await server.stop();
      await pg.close();
      rmSync(storageRoot, { recursive: true, force: true });
    },
  };
}
