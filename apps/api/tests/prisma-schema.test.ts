/**
 * Block 2 (spec-FEAT-002) -- prisma/schema.prisma + its hand-edited migration.
 *
 * Runs against `DATABASE_URL_TEST`/`DIRECT_URL_TEST` (root `.env`), never against
 * `DATABASE_URL`/`DIRECT_URL` (development). Loads the root `.env` explicitly with `dotenv`,
 * since vitest does not load it on its own and this app has no `.env` of its own.
 *
 * Rule #0 (testing.instructions.md): every test that inserts data creates its own rows (random
 * uuids/emails per test, never reusing seed data -- Block 3's seed does not exist yet at this
 * point in the spec order) and deletes them in `afterEach`, in FK-safe order (categories before
 * users).
 *
 * Raw SQL choice: partial unique indexes cannot be expressed in the Prisma DSL (`@@unique` is
 * always table-wide), so their behavior can only be exercised with direct SQL -- this file uses
 * `prisma.$executeRaw` (tagged-template, parameterized) rather than `$executeRawUnsafe`, which
 * gets the "raw SQL insert" the spec asks for without string-interpolating values.
 */
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

const apiRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
config({ path: path.resolve(apiRoot, "../../.env") });

const TEST_DATABASE_URL = process.env["DATABASE_URL_TEST"];
const TEST_DIRECT_URL = process.env["DIRECT_URL_TEST"];

if (!TEST_DATABASE_URL || !TEST_DIRECT_URL) {
  throw new Error(
    "DATABASE_URL_TEST/DIRECT_URL_TEST must be set (root .env) to run apps/api's Prisma tests.",
  );
}

describe("prisma schema (Block 2, spec-FEAT-002)", () => {
  it(
    "prisma migrate deploy applies the init migration cleanly against DATABASE_URL_TEST",
    () => {
      // Spawns a whole `pnpm exec prisma migrate deploy` process (cold Node start + CLI +
      // real network round-trip to Supabase) -- vitest.config.ts's default testTimeout (30s) can
      // be too tight for this against real, non-sandboxed network latency. A dedicated, longer
      // timeout here avoids that without loosening the global default the rest of the suite runs
      // under.
      expect(() =>
        execSync("pnpm exec prisma migrate deploy", {
          cwd: apiRoot,
          env: {
            ...process.env,
            DATABASE_URL: TEST_DATABASE_URL,
            DIRECT_URL: TEST_DIRECT_URL,
          },
          stdio: "pipe",
        }),
      ).not.toThrow();
    },
    60_000,
  );

  describe("with a live client against DATABASE_URL_TEST", () => {
    let prisma: InstanceType<
      typeof import("../src/generated/prisma/client.ts").PrismaClient
    >;

    beforeAll(async () => {
      const { PrismaClient } = await import("../src/generated/prisma/client.ts");
      const { PrismaPg } = await import("@prisma/adapter-pg");
      const adapter = new PrismaPg({ connectionString: TEST_DATABASE_URL });
      prisma = new PrismaClient({ adapter });
    });

    describe("unique partial index on categories(name_normalized) WHERE owner_id IS NULL (AC-10)", () => {
      const createdIds: string[] = [];

      afterEach(async () => {
        if (createdIds.length > 0) {
          await prisma.$executeRaw`DELETE FROM categories WHERE id = ANY(${createdIds}::uuid[])`;
          createdIds.length = 0;
        }
      });

      it("rejects a second predefined category with the same nameNormalized inserted via raw SQL", async () => {
        const nameNormalized = `test predefined ${randomUUID()}`;
        const firstId = randomUUID();
        createdIds.push(firstId);

        await prisma.$executeRaw`
          INSERT INTO categories (id, name, name_normalized, owner_id, active, created_at)
          VALUES (${firstId}::uuid, ${nameNormalized}, ${nameNormalized}, NULL, true, now())
        `;

        const secondId = randomUUID();
        await expect(
          prisma.$executeRaw`
            INSERT INTO categories (id, name, name_normalized, owner_id, active, created_at)
            VALUES (${secondId}::uuid, ${nameNormalized}, ${nameNormalized}, NULL, true, now())
          `,
        ).rejects.toThrow();
      });
    });

    describe("composite index on expenses(user_id, when, created_at) (spec-FEAT-003a Block 1)", () => {
      it("declares the index in the Prisma model with the expected sort directions", () => {
        const schemaPath = path.resolve(apiRoot, "prisma/schema.prisma");
        const schema = readFileSync(schemaPath, "utf-8");
        const expenseModelMatch = schema.match(/model Expense \{[\s\S]*?\n\}/);
        expect(expenseModelMatch).not.toBeNull();
        const expenseModel = expenseModelMatch![0];

        expect(expenseModel).toContain(
          "@@index([userId, when(sort: Desc), createdAt(sort: Desc)])",
        );
      });

      it("sad path: exists in the real database after the migration is applied (queries pg_indexes)", async () => {
        const result = await prisma.$queryRaw<
          Array<{ indexdef: string }>
        >`SELECT indexdef FROM pg_indexes WHERE tablename = 'expenses' AND indexname = 'expenses_user_id_when_created_at_idx'`;

        expect(result).toHaveLength(1);
        // Column order matters: it is what lets the planner satisfy WHERE user_id = ? ORDER BY
        // ... with an index scan instead of a sort. A single ordered match (rather than three
        // independent toContain calls) is what actually catches the columns coming back
        // reordered. Postgres only quotes identifiers that need it (e.g. the reserved word
        // `when`); plain identifiers like `created_at` come back unquoted from pg_indexes.
        expect(result[0]!.indexdef).toMatch(
          /\(user_id, "when" DESC, created_at DESC\)/,
        );
      });
    });

    describe("unique partial index on categories(owner_id, name_normalized) WHERE owner_id IS NOT NULL", () => {
      const createdCategoryIds: string[] = [];
      const createdUserIds: string[] = [];

      afterEach(async () => {
        if (createdCategoryIds.length > 0) {
          await prisma.$executeRaw`DELETE FROM categories WHERE id = ANY(${createdCategoryIds}::uuid[])`;
          createdCategoryIds.length = 0;
        }
        if (createdUserIds.length > 0) {
          await prisma.$executeRaw`DELETE FROM users WHERE id = ANY(${createdUserIds}::uuid[])`;
          createdUserIds.length = 0;
        }
      });

      it("rejects a duplicate nameNormalized for the same owner, but allows it across different owners", async () => {
        const ownerA = randomUUID();
        const ownerB = randomUUID();
        createdUserIds.push(ownerA, ownerB);

        await prisma.$executeRaw`
          INSERT INTO users (id, email, password_hash, created_at)
          VALUES (${ownerA}::uuid, ${`owner-a-${ownerA}@test.ggasia.local`}, ${"test-hash"}, now())
        `;
        await prisma.$executeRaw`
          INSERT INTO users (id, email, password_hash, created_at)
          VALUES (${ownerB}::uuid, ${`owner-b-${ownerB}@test.ggasia.local`}, ${"test-hash"}, now())
        `;

        const nameNormalized = `test owned ${randomUUID()}`;
        const firstId = randomUUID();
        createdCategoryIds.push(firstId);

        await prisma.$executeRaw`
          INSERT INTO categories (id, name, name_normalized, owner_id, active, created_at)
          VALUES (${firstId}::uuid, ${nameNormalized}, ${nameNormalized}, ${ownerA}::uuid, true, now())
        `;

        const secondId = randomUUID();
        await expect(
          prisma.$executeRaw`
            INSERT INTO categories (id, name, name_normalized, owner_id, active, created_at)
            VALUES (${secondId}::uuid, ${nameNormalized}, ${nameNormalized}, ${ownerA}::uuid, true, now())
          `,
        ).rejects.toThrow();

        const thirdId = randomUUID();
        createdCategoryIds.push(thirdId);
        await expect(
          prisma.$executeRaw`
            INSERT INTO categories (id, name, name_normalized, owner_id, active, created_at)
            VALUES (${thirdId}::uuid, ${nameNormalized}, ${nameNormalized}, ${ownerB}::uuid, true, now())
          `,
        ).resolves.not.toThrow();
      });
    });
  });
});
