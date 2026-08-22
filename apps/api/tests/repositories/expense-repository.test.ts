/**
 * Block 8 (spec-FEAT-002) -- src/repositories/expense-repository.ts.
 *
 * Runs against `DATABASE_URL_TEST` (root `.env`). Uses the seeded TEST_USER_ID and the
 * predefined "Comida" category (both preexisting fixture data, Rule #0 -- read only, never
 * mutated) to satisfy the Expense FKs. Only the Expense row this suite creates is deleted in
 * `afterEach`, by its own id.
 */
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const apiRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
config({ path: path.resolve(apiRoot, "../../.env") });

const TEST_DATABASE_URL = process.env["DATABASE_URL_TEST"];

if (!TEST_DATABASE_URL) {
  throw new Error("DATABASE_URL_TEST must be set (root .env) to run apps/api's Prisma tests.");
}

describe("expenseRepository.create (Block 8, spec-FEAT-002)", () => {
  let prisma: InstanceType<typeof import("../../src/generated/prisma/client.ts").PrismaClient>;
  let TEST_USER_ID: string;
  let categoryId: string;

  const createdExpenseIds: string[] = [];

  beforeAll(async () => {
    const { PrismaClient } = await import("../../src/generated/prisma/client.ts");
    const { PrismaPg } = await import("@prisma/adapter-pg");
    const adapter = new PrismaPg({ connectionString: TEST_DATABASE_URL });
    prisma = new PrismaClient({ adapter });

    const { seed, TEST_USER_ID: seededId } = await import("../../prisma/seed.ts");
    await seed(prisma);
    TEST_USER_ID = seededId;

    const { findPredefinedByName } = await import(
      "../../src/repositories/category-repository.ts"
    );
    const comida = await findPredefinedByName(prisma, "Comida");
    if (!comida) {
      throw new Error("Expected the seeded 'Comida' predefined category to exist.");
    }
    categoryId = comida.id;
  });

  afterEach(async () => {
    if (createdExpenseIds.length > 0) {
      await prisma.expense.deleteMany({ where: { id: { in: createdExpenseIds } } });
      createdExpenseIds.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("persists an expense with amount as an exact 2-decimal Decimal (NFR-02)", async () => {
    const { create } = await import("../../src/repositories/expense-repository.ts");
    const { Prisma } = await import("../../src/generated/prisma/client.ts");

    const expense = await create(prisma, {
      userId: TEST_USER_ID,
      amount: new Prisma.Decimal("1500.5"),
      place: "Kiosco de la esquina",
      when: new Date("2026-08-19T12:00:00.000Z"),
      categoryId,
      categoryOrigin: "automatica",
      description: "",
      name: "Kiosco de la esquina",
      type: "Personal",
      currency: "ARS",
      rawInput: "kiosco 1500.5",
      channel: "texto",
    });
    createdExpenseIds.push(expense.id);

    // `.toString()` on a Decimal read back through pg/@prisma's driver stack is not guaranteed to
    // preserve a trailing zero from the column's declared scale (a driver-level quirk, not a
    // precision loss -- the NUMERIC(12,2) column itself always stores the exact scaled value).
    // `.toFixed(2)` is the actual guarantee NFR-02 and the HTTP layer (routes/expenses.ts) rely
    // on, so assert against that instead of raw `.toString()` fidelity.
    expect(expense.amount.toFixed(2)).toBe("1500.50");
  });
});

describe("expenseRepository.findManyForUser (Block 2, spec-FEAT-003a)", () => {
  let prisma: InstanceType<typeof import("../../src/generated/prisma/client.ts").PrismaClient>;
  let TEST_USER_ID: string;
  let OTHER_USER_ID: string;
  let categoryId: string;

  const createdExpenseIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const { PrismaClient } = await import("../../src/generated/prisma/client.ts");
    const { PrismaPg } = await import("@prisma/adapter-pg");
    const adapter = new PrismaPg({ connectionString: TEST_DATABASE_URL });
    prisma = new PrismaClient({ adapter });

    const { seed, TEST_USER_ID: seededId } = await import("../../prisma/seed.ts");
    await seed(prisma);
    TEST_USER_ID = seededId;

    const { findPredefinedByName } = await import(
      "../../src/repositories/category-repository.ts"
    );
    const comida = await findPredefinedByName(prisma, "Comida");
    if (!comida) {
      throw new Error("Expected the seeded 'Comida' predefined category to exist.");
    }
    categoryId = comida.id;

    // A second real user, disjoint from the seeded TEST_USER_ID, to prove per-user isolation.
    OTHER_USER_ID = randomUUID();
    await prisma.user.create({
      data: {
        id: OTHER_USER_ID,
        email: `other-${OTHER_USER_ID}@ggasia.local`,
        passwordHash: "test-hash",
      },
    });
    createdUserIds.push(OTHER_USER_ID);
  });

  afterEach(async () => {
    if (createdExpenseIds.length > 0) {
      await prisma.expense.deleteMany({ where: { id: { in: createdExpenseIds } } });
      createdExpenseIds.length = 0;
    }
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      createdUserIds.length = 0;
    }
    await prisma.$disconnect();
  });

  /** Persists one fixture expense via the already-tested `create()`, tracked for `afterEach` cleanup. */
  async function makeExpense(overrides: {
    userId?: string;
    when: Date;
  }): Promise<import("../../src/generated/prisma/client.ts").Expense> {
    const { create } = await import("../../src/repositories/expense-repository.ts");
    const { Prisma } = await import("../../src/generated/prisma/client.ts");

    const expense = await create(prisma, {
      userId: overrides.userId ?? TEST_USER_ID,
      amount: new Prisma.Decimal("100.00"),
      place: "Fixture place",
      when: overrides.when,
      categoryId,
      categoryOrigin: "automatica",
      description: "",
      name: "Fixture place",
      type: "Personal",
      currency: "ARS",
      rawInput: `fixture 100 - ${randomUUID()}`,
      channel: "texto",
    });
    createdExpenseIds.push(expense.id);
    return expense;
  }

  it("returns only the expenses of the requested userId, never another user's", async () => {
    const { findManyForUser } = await import("../../src/repositories/expense-repository.ts");

    const mine = await makeExpense({ when: new Date("2026-08-10T12:00:00.000Z") });
    await makeExpense({ userId: OTHER_USER_ID, when: new Date("2026-08-10T12:00:00.000Z") });

    const result = await findManyForUser(prisma, { userId: TEST_USER_ID, limit: 50 });

    expect(result.map((expense) => expense.id)).toContain(mine.id);
    expect(result.every((expense) => expense.userId === TEST_USER_ID)).toBe(true);
  });

  it("orders by when descending", async () => {
    const { findManyForUser } = await import("../../src/repositories/expense-repository.ts");

    const older = await makeExpense({ when: new Date("2026-08-01T12:00:00.000Z") });
    const newer = await makeExpense({ when: new Date("2026-08-15T12:00:00.000Z") });

    const result = await findManyForUser(prisma, { userId: TEST_USER_ID, limit: 50 });

    const olderIndex = result.findIndex((expense) => expense.id === older.id);
    const newerIndex = result.findIndex((expense) => expense.id === newer.id);
    expect(newerIndex).toBeLessThan(olderIndex);
  });

  it("breaks ties by createdAt descending when two expenses share the same when", async () => {
    const { findManyForUser } = await import("../../src/repositories/expense-repository.ts");

    const sameWhen = new Date("2026-08-05T12:00:00.000Z");
    const first = await makeExpense({ when: sameWhen });
    const second = await makeExpense({ when: sameWhen });

    // Force a deterministic createdAt ordering instead of relying on real-clock timing between
    // the two `create()` calls above.
    await prisma.expense.update({
      where: { id: first.id },
      data: { createdAt: new Date("2026-08-05T12:00:00.000Z") },
    });
    await prisma.expense.update({
      where: { id: second.id },
      data: { createdAt: new Date("2026-08-05T12:00:01.000Z") },
    });

    const result = await findManyForUser(prisma, { userId: TEST_USER_ID, limit: 50 });

    const firstIndex = result.findIndex((expense) => expense.id === first.id);
    const secondIndex = result.findIndex((expense) => expense.id === second.id);
    expect(secondIndex).toBeLessThan(firstIndex);
  });

  it("respects limit: with more rows than the limit, returns exactly limit rows, the most recent", async () => {
    const { findManyForUser } = await import("../../src/repositories/expense-repository.ts");

    const oldest = await makeExpense({ when: new Date("2026-08-01T12:00:00.000Z") });
    const middle = await makeExpense({ when: new Date("2026-08-05T12:00:00.000Z") });
    const newest = await makeExpense({ when: new Date("2026-08-10T12:00:00.000Z") });

    const result = await findManyForUser(prisma, { userId: TEST_USER_ID, limit: 2 });

    expect(result).toHaveLength(2);
    expect(result.map((expense) => expense.id)).toEqual([newest.id, middle.id]);
    expect(result.map((expense) => expense.id)).not.toContain(oldest.id);
  });

  it("includes each expense's category name in the result", async () => {
    const { findManyForUser } = await import("../../src/repositories/expense-repository.ts");

    const expense = await makeExpense({ when: new Date("2026-08-12T12:00:00.000Z") });

    const result = await findManyForUser(prisma, { userId: TEST_USER_ID, limit: 50 });

    const found = result.find((row) => row.id === expense.id);
    expect(found?.category.name).toBe("Comida");
  });

  it("a user with no expenses returns an empty array, never null or an error", async () => {
    const { findManyForUser } = await import("../../src/repositories/expense-repository.ts");

    const result = await findManyForUser(prisma, { userId: randomUUID(), limit: 50 });

    expect(result).toEqual([]);
  });

  it("propagates the error when Prisma throws, instead of turning it into an empty list", async () => {
    const { findManyForUser } = await import("../../src/repositories/expense-repository.ts");
    type PrismaClientType = InstanceType<
      typeof import("../../src/generated/prisma/client.ts").PrismaClient
    >;

    const thrown = new Error("Prisma exploded: connection refused at db.internal:5432");
    const brokenPrisma = {
      expense: { findMany: vi.fn().mockRejectedValue(thrown) },
    } as unknown as PrismaClientType;

    await expect(
      findManyForUser(brokenPrisma, { userId: TEST_USER_ID, limit: 50 }),
    ).rejects.toThrow(thrown);
  });
});
