/**
 * Block 8 (spec-FEAT-002) -- src/repositories/expense-repository.ts.
 *
 * Runs against `DATABASE_URL_TEST` (root `.env`). Uses the seeded TEST_USER_ID and the
 * predefined "Comida" category (both preexisting fixture data, Rule #0 -- read only, never
 * mutated) to satisfy the Expense FKs. Only the Expense row this suite creates is deleted in
 * `afterEach`, by its own id.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

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

    expect(expense.amount.toString()).toBe("1500.50");
  });
});
