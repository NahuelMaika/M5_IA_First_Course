/**
 * Block 11 (spec-FEAT-002) -- end-to-end integration tests for `POST /expenses`.
 *
 * Exercises the FULL app (`buildApp` with a real `PrismaClient`, adapter-driven, pointed at
 * `DATABASE_URL_TEST`) through `fastify.inject` -- no mocks of `parseExpense`, `resolveCategoryName`
 * or Prisma anywhere in this file. This is the only test in the suite that proves the whole chain
 * (auth -> body validation -> service -> repositories -> Postgres) is wired together correctly, per
 * the PRD Goal ("un gasto ingerido por texto quede persistido, categorizado y recuperable en base de
 * datos").
 *
 * `beforeAll` runs `seed()` (Block 3), which upserts the 11 predefined categories and the fixed
 * `TEST_USER_ID` -- both are read-only fixture data for this suite, never recreated or deleted per
 * test. It does NOT run `prisma migrate deploy` -- Block 2's own test file already applies it, and
 * `vitest.config.ts` runs test files serially (`fileParallelism: false`) precisely so that
 * ordering is reliable; spawning a second CLI process here was redundant real-network round-trip
 * work that used to push this hook past its timeout. Run the migration by hand first if this file
 * is ever executed in isolation.
 *
 * Cleanup strategy (documented per spec's Block 11 "decisión documentada en un comentario al inicio
 * del archivo"): this file does NOT use `TRUNCATE ... CASCADE`. `DATABASE_URL_TEST` is a SHARED,
 * live database that Blocks 2/3/8's own test files (`prisma-schema.test.ts`, `seed.test.ts`,
 * `repositories/*.test.ts`) also exercise against -- a blanket `TRUNCATE expenses` or
 * `DELETE FROM categories WHERE owner_id IS NOT NULL` here would silently destroy rows those other
 * files are asserting on mid-run. Every one of those sibling files instead follows "Rule #0"
 * (`testing.instructions.md`): each test creates its own rows and deletes them BY THEIR OWN ID in
 * `afterEach`, never a blanket statement. This file follows that same, already-established
 * convention instead of the spec text's literal `TRUNCATE` suggestion, for exactly the reason those
 * sibling files document. The 11 predefined categories and `TEST_USER_ID` are never touched.
 *
 * Every test that needs a unique, locatable row embeds a `randomUUID()` either in the free-text
 * description (after the ` - ` separator, which `parseExpense` never re-parses) or, for category
 * markers, as the marker name itself (`#<uuid>` is a valid marker per `category-marker.ts`'s
 * character set: letters, digits, `-`, `_`) -- this guarantees no collision with rows other parallel
 * test files, or other runs of this same suite, might leave behind, and lets each test look its own
 * row up afterwards via `rawInput`/category name instead of asserting on a global count.
 */
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { RejectedExpense } from "@ggasia/domain";

// `RejectionReason` itself is not part of the barrel's public surface (only `RejectedExpense` is,
// per `@ggasia/domain`'s `index.ts`) -- derived the same way `expense-service.ts` (Block 9) does.
type RejectionReason = RejectedExpense["reason"];

const apiRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
config({ path: path.resolve(apiRoot, "../../.env") });

const TEST_DATABASE_URL = process.env["DATABASE_URL_TEST"];
const TEST_DIRECT_URL = process.env["DIRECT_URL_TEST"];

if (!TEST_DATABASE_URL || !TEST_DIRECT_URL) {
  throw new Error(
    "DATABASE_URL_TEST/DIRECT_URL_TEST must be set (root .env) to run apps/api's Prisma tests.",
  );
}

const UNKNOWN_USER_ID = "99999999-9999-9999-9999-999999999999";

function formatDDMMYYYY(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

describe("POST /expenses -- end-to-end (Block 11, spec-FEAT-002)", () => {
  let prisma: InstanceType<typeof import("../src/generated/prisma/client.ts").PrismaClient>;
  let app: Awaited<ReturnType<typeof import("../src/app.ts").buildApp>>;
  let TEST_USER_ID: string;

  const createdExpenseIds: string[] = [];
  const createdCategoryIds: string[] = [];

  beforeAll(async () => {
    // Does NOT run `prisma migrate deploy` here: Block 2's own test (tests/prisma-schema.test.ts)
    // already applies it, and vitest.config.ts now runs test files serially (fileParallelism:
    // false) specifically so that ordering is reliable -- spawning a second full CLI process
    // (real network round-trip) here was redundant work that pushed this hook past its timeout
    // against the real Supabase test project. If this file is ever run in isolation without the
    // rest of the suite, run `pnpm exec prisma migrate deploy` by hand first.
    const { PrismaClient } = await import("../src/generated/prisma/client.ts");
    const { PrismaPg } = await import("@prisma/adapter-pg");
    const adapter = new PrismaPg({ connectionString: TEST_DATABASE_URL });
    prisma = new PrismaClient({ adapter });

    const { seed, TEST_USER_ID: seededId } = await import("../prisma/seed.ts");
    await seed(prisma);
    TEST_USER_ID = seededId;

    const { buildApp } = await import("../src/app.ts");
    app = buildApp({ prismaClient: prisma });
  });

  afterEach(async () => {
    if (createdExpenseIds.length > 0) {
      await prisma.expense.deleteMany({ where: { id: { in: createdExpenseIds } } });
      createdExpenseIds.length = 0;
    }
    if (createdCategoryIds.length > 0) {
      await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
      createdCategoryIds.length = 0;
    }
  });

  afterAll(async () => {
    // Closing the app disconnects the injected Prisma client too (Block 4's plugin `onClose` hook)
    // -- no separate `prisma.$disconnect()` needed/possible after this.
    await app.close();
  });

  describe("AC-01, AC-06 -- valid input, automatic category, persisted and recoverable", () => {
    it("201s and leaves a recoverable, fully-resolved row in the database", async () => {
      const rawInput = `café 1500 - integration ${randomUUID()}`;

      const response = await app.inject({
        method: "POST",
        url: "/expenses",
        headers: { "x-user-id": TEST_USER_ID },
        payload: { input: rawInput },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body).toMatchObject({
        amount: "1500.00",
        place: "café",
        category: "Comida",
        categoryOrigin: "automatica",
        type: "Personal",
        currency: "ARS",
      });

      const persisted = await prisma.expense.findFirst({ where: { userId: TEST_USER_ID, rawInput } });
      if (!persisted) throw new Error("expected the expense to have been persisted");
      createdExpenseIds.push(persisted.id);

      expect(persisted.amount.toString()).toBe("1500.00");
      expect(persisted.place).toBe("café");
      expect(persisted.categoryOrigin).toBe("automatica");

      const category = await prisma.category.findUnique({ where: { id: persisted.categoryId } });
      expect(category?.name).toBe("Comida");
      expect(category?.ownerId).toBeNull();
    });
  });

  describe("AC-02 -- one 422 + zero rows created per RejectionReason", () => {
    const cases: Array<{ reason: RejectionReason; makeInput: () => string }> = [
      { reason: "empty_left_segment", makeInput: () => `- solo un comentario ${randomUUID()}` },
      { reason: "amount_indeterminate", makeInput: () => `sin monto - ${randomUUID()}` },
      { reason: "amount_malformed", makeInput: () => `cafe 1.5 - ${randomUUID()}` },
      { reason: "amount_zero", makeInput: () => `cafe 0 - ${randomUUID()}` },
      { reason: "empty_place", makeInput: () => `gaste 5000 en #almuerzos - ${randomUUID()}` },
      {
        reason: "future_date",
        makeInput: () => {
          const future = new Date();
          future.setFullYear(future.getFullYear() + 1);
          return `cafe 1500 ${formatDDMMYYYY(future)} - ${randomUUID()}`;
        },
      },
      {
        reason: "date_out_of_window",
        makeInput: () => {
          const past = new Date();
          past.setMonth(past.getMonth() - 14);
          return `cafe 1500 ${formatDDMMYYYY(past)} - ${randomUUID()}`;
        },
      },
      { reason: "length_exceeded", makeInput: () => "a".repeat(600) },
    ];

    it.each(cases)("$reason -> 422 with { reason }, zero rows created", async ({ reason, makeInput }) => {
      const rawInput = makeInput();

      const response = await app.inject({
        method: "POST",
        url: "/expenses",
        headers: { "x-user-id": TEST_USER_ID },
        payload: { input: rawInput },
      });

      expect(response.statusCode).toBe(422);
      expect(response.json()).toEqual({ reason });

      const count = await prisma.expense.count({ where: { rawInput } });
      expect(count).toBe(0);
    });
  });

  describe("AC-03 -- no header / unknown header -> 401, nothing persisted", () => {
    it("401s with no x-user-id header and creates no row", async () => {
      const rawInput = `café 1500 - ${randomUUID()}`;

      const response = await app.inject({
        method: "POST",
        url: "/expenses",
        payload: { input: rawInput },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: "unauthorized" });

      const count = await prisma.expense.count({ where: { rawInput } });
      expect(count).toBe(0);
    });

    it("401s with an x-user-id that matches no user and creates no row (same generic body)", async () => {
      const rawInput = `café 1500 - ${randomUUID()}`;

      const response = await app.inject({
        method: "POST",
        url: "/expenses",
        headers: { "x-user-id": UNKNOWN_USER_ID },
        payload: { input: rawInput },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: "unauthorized" });

      const count = await prisma.expense.count({ where: { rawInput } });
      expect(count).toBe(0);
    });
  });

  describe("AC-04 -- marker naming a nonexistent category creates an own category and associates it", () => {
    it("creates the own category and the expense pointing at it", async () => {
      const markerName = randomUUID();
      const rawInput = `kiosco 1500 #${markerName}`;

      const response = await app.inject({
        method: "POST",
        url: "/expenses",
        headers: { "x-user-id": TEST_USER_ID },
        payload: { input: rawInput },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.category).toBe(markerName);
      expect(body.categoryOrigin).toBe("marcador");

      const category = await prisma.category.findFirst({
        where: { ownerId: TEST_USER_ID, name: markerName },
      });
      if (!category) throw new Error("expected the own category to have been created");
      createdCategoryIds.push(category.id);

      const persisted = await prisma.expense.findFirst({ where: { userId: TEST_USER_ID, rawInput } });
      if (!persisted) throw new Error("expected the expense to have been persisted");
      createdExpenseIds.push(persisted.id);
      expect(persisted.categoryId).toBe(category.id);
      expect(persisted.categoryOrigin).toBe("marcador");
    });
  });

  describe("AC-05 -- marker normalizing to an already-visible category reuses it, no duplicate", () => {
    it("reuses the own category created by a first request when a second marker normalizes the same", async () => {
      const markerName = `Regalo Integration ${randomUUID()}`;
      const firstInput = `kiosco 1500 #${markerName.replaceAll(" ", "-")}`;

      const firstResponse = await app.inject({
        method: "POST",
        url: "/expenses",
        headers: { "x-user-id": TEST_USER_ID },
        payload: { input: firstInput },
      });
      expect(firstResponse.statusCode).toBe(201);

      const firstExpense = await prisma.expense.findFirst({
        where: { userId: TEST_USER_ID, rawInput: firstInput },
      });
      if (!firstExpense) throw new Error("expected the first expense to have been persisted");
      createdExpenseIds.push(firstExpense.id);

      const ownedCategory = await prisma.category.findUnique({
        where: { id: firstExpense.categoryId },
      });
      if (!ownedCategory) throw new Error("expected the own category to have been created");
      expect(ownedCategory.ownerId).toBe(TEST_USER_ID);
      createdCategoryIds.push(ownedCategory.id);

      // Same normalized marker, different literal casing/whitespace-as-hyphen -- must resolve to the
      // SAME category row, not create a second one.
      const secondInput = `almacen 800 #${markerName.replaceAll(" ", "-").toUpperCase()}`;

      const secondResponse = await app.inject({
        method: "POST",
        url: "/expenses",
        headers: { "x-user-id": TEST_USER_ID },
        payload: { input: secondInput },
      });
      expect(secondResponse.statusCode).toBe(201);

      const secondExpense = await prisma.expense.findFirst({
        where: { userId: TEST_USER_ID, rawInput: secondInput },
      });
      if (!secondExpense) throw new Error("expected the second expense to have been persisted");
      createdExpenseIds.push(secondExpense.id);

      expect(secondExpense.categoryId).toBe(ownedCategory.id);

      const duplicates = await prisma.category.count({
        where: { ownerId: TEST_USER_ID, nameNormalized: ownedCategory.nameNormalized },
      });
      expect(duplicates).toBe(1);
    });
  });

  describe("AC-07 -- unknown marker + indeterminate amount rejects everything, category not created", () => {
    it("422s and creates no category for the unresolved marker", async () => {
      const markerName = randomUUID();
      const rawInput = `kiosco #${markerName}`;

      const response = await app.inject({
        method: "POST",
        url: "/expenses",
        headers: { "x-user-id": TEST_USER_ID },
        payload: { input: rawInput },
      });

      expect(response.statusCode).toBe(422);
      expect(response.json()).toEqual({ reason: "amount_indeterminate" });

      const category = await prisma.category.findFirst({
        where: { ownerId: TEST_USER_ID, name: markerName },
      });
      expect(category).toBeNull();

      const expenseCount = await prisma.expense.count({ where: { rawInput } });
      expect(expenseCount).toBe(0);
    });
  });

  describe("AC-08 -- persisted currency, channel and rawInput fidelity", () => {
    it("persists currency ARS, channel texto and the exact rawInput sent", async () => {
      const rawInput = `supermercado 2500,50 - compra semanal ${randomUUID()}`;

      const response = await app.inject({
        method: "POST",
        url: "/expenses",
        headers: { "x-user-id": TEST_USER_ID },
        payload: { input: rawInput },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({ currency: "ARS" });

      const persisted = await prisma.expense.findFirst({ where: { userId: TEST_USER_ID, rawInput } });
      if (!persisted) throw new Error("expected the expense to have been persisted");
      createdExpenseIds.push(persisted.id);

      expect(persisted.currency).toBe("ARS");
      expect(persisted.channel).toBe("texto");
      expect(persisted.rawInput).toBe(rawInput);
    });
  });

  describe("AC-09 -- invalid body shapes -> 400, nothing persisted", () => {
    it.each([
      { label: "missing input", payload: {} },
      { label: "empty input", payload: { input: "" } },
      { label: "non-string input", payload: { input: 123 } },
    ])("$label -> 400", async ({ payload }) => {
      const response = await app.inject({
        method: "POST",
        url: "/expenses",
        headers: { "x-user-id": TEST_USER_ID },
        payload,
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("AC-10 -- seed idempotency and a genuine uniqueness violation aborting the boot path", () => {
    it("running the seed twice through the same wiring the app boots with does not throw or duplicate", async () => {
      const { seed } = await import("../prisma/seed.ts");

      await expect(seed(prisma)).resolves.toBeUndefined();

      const predefined = await prisma.category.findMany({ where: { ownerId: null } });
      expect(predefined).toHaveLength(11);

      const users = await prisma.user.findMany({ where: { id: TEST_USER_ID } });
      expect(users).toHaveLength(1);
    });

    it("a genuine uniqueness violation on the partial index rejects the raw insert (never silently swallowed)", async () => {
      const nameNormalized = `integration duplicate ${randomUUID()}`;
      const firstId = randomUUID();

      try {
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
      } finally {
        await prisma.$executeRaw`DELETE FROM categories WHERE id = ${firstId}::uuid`;
      }
    });
  });
});
