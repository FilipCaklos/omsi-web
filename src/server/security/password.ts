import "server-only";
import { hash, verify, type Algorithm } from "@node-rs/argon2";

// Algorithm je ambient const enum (nedostupný pri isolatedModules); 2 = Argon2id
const ARGON2ID = 2 as Algorithm;

/** OWASP odporúčanie pre Argon2id: m=19 MiB, t=2, p=1. */
const ARGON2_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(data: { hash: string; password: string }): Promise<boolean> {
  if (!data.hash.startsWith("$argon2")) return false;
  try {
    return await verify(data.hash, data.password);
  } catch {
    return false;
  }
}
