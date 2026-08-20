import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Every DB-dependent test file runs its own migration/seed and opens its own PrismaClient
    // against the SAME remote DATABASE_URL_TEST (Supabase). Running files in parallel (Vitest's
    // default) races those beforeAll hooks against each other -- concurrent `prisma migrate
    // deploy` invocations contend for Prisma's advisory lock, and concurrent seed() calls can
    // collide on the same upsert -- producing exactly the cascade of hook/test timeouts and
    // "Unique constraint failed" errors seen when this suite first ran against a real DB
    // (FEAT-002 CODE closeout). Serializing file execution removes the race entirely; it costs
    // wall-clock time, not correctness.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
