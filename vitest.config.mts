import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // Ochranný modul Next.js – v unit testoch beží kód mimo React Server prostredia
      "server-only": path.resolve(import.meta.dirname, "tests/support/empty.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/support/env.ts"],
    // Integračné testy štartujú vlastnú PostgreSQL (PGlite) – dlhší limit
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
