import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/env";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: env().DATABASE_URL, max: env().DATABASE_POOL_MAX });
  return new PrismaClient({
    adapter,
    log: env().NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

/** Jediná inštancia Prisma klienta (pri HMR v dev režime sa nevytvárajú nové pooly). */
export function db(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createClient();
  }
  return globalForPrisma.prisma;
}
