/**
 * Block 9 (spec-FEAT-002) -- src/services/expense-service.ts.
 *
 * Fully mocked at the Prisma boundary: no real database connection. `parseExpense` and
 * `resolveCategoryName` run for real (from the compiled `@ggasia/domain` / `@ggasia/categorization`
 * packages) so the service is exercised against its real contract, not a stub of it. Only
 * `PrismaClient` is faked -- an in-memory `category`/`expense` store that mimics the shape
 * `category-repository.ts` and `expense-repository.ts` (Block 8) query against.
 */
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_USER_ID = "11111111-1111-1111-1111-111111111111";

interface FakeCategory {
  id: string;
  name: string;
  nameNormalized: string;
  ownerId: string | null;
  active: boolean;
}

function fakePrismaClient(seedCategories: FakeCategory[]) {
  const categories: FakeCategory[] = [...seedCategories];
  const expenses: unknown[] = [];
  let expenseCreateImpl: ((data: unknown) => unknown) | null = null;
  let expenseFindManyImpl: ((args: unknown) => unknown) | null = null;

  return {
    __state: { categories, expenses },
    __setExpenseCreateImpl(impl: ((data: unknown) => unknown) | null) {
      expenseCreateImpl = impl;
    },
    __setExpenseFindManyImpl(impl: ((args: unknown) => unknown) | null) {
      expenseFindManyImpl = impl;
    },
    category: {
      findMany: vi.fn(async ({ where }: { where: { OR: Array<{ ownerId: string | null }> } }) => {
        return categories.filter((category) =>
          where.OR.some((clause) => category.ownerId === clause.ownerId),
        );
      }),
      findFirst: vi.fn(
        async ({
          where,
        }: {
          where: { name: string; ownerId?: null; OR?: Array<{ ownerId: string | null }> };
        }) => {
          return (
            categories.find((category) => {
              if (category.name !== where.name) return false;
              if (where.OR) {
                return where.OR.some((clause) => category.ownerId === clause.ownerId);
              }
              return category.ownerId === where.ownerId;
            }) ?? null
          );
        },
      ),
      create: vi.fn(
        async ({
          data,
        }: {
          data: { name: string; nameNormalized: string; ownerId: string };
        }) => {
          const created: FakeCategory = {
            id: randomUUID(),
            name: data.name,
            nameNormalized: data.nameNormalized,
            ownerId: data.ownerId,
            active: true,
          };
          categories.push(created);
          return created;
        },
      ),
    },
    expense: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (expenseCreateImpl) {
          return expenseCreateImpl(data);
        }
        const created = { id: randomUUID(), createdAt: new Date(), ...data };
        expenses.push(created);
        return created;
      }),
      findMany: vi.fn(async (args: unknown) => {
        if (expenseFindManyImpl) {
          return expenseFindManyImpl(args);
        }
        return [];
      }),
    },
  };
}

/**
 * A fake row shaped like `ExpenseWithCategory` (Block 2, spec-FEAT-003a) -- what
 * `expenseRepository.findManyForUser` returns: an `Expense` row with its `category` relation
 * resolved. `rawInput` is present, same as the real Prisma row, so tests can prove the service's
 * mapping drops it rather than merely never having it in the fixture.
 */
function fakeExpenseRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: randomUUID(),
    userId: TEST_USER_ID,
    amount: "1500.00",
    place: "café",
    when: new Date("2026-08-10T00:00:00.000Z"),
    categoryId: randomUUID(),
    categoryOrigin: "automatica",
    description: "",
    name: "café",
    type: "Personal",
    currency: "ARS",
    rawInput: "café 1500",
    channel: "texto",
    createdAt: new Date("2026-08-10T12:00:00.000Z"),
    category: {
      id: randomUUID(),
      name: "Comida",
      nameNormalized: "comida",
      ownerId: null,
      active: true,
    },
    ...overrides,
  };
}

function seedFor(overrides: Partial<FakeCategory>[] = []): FakeCategory[] {
  const base: FakeCategory = {
    id: randomUUID(),
    name: "Comida",
    nameNormalized: "comida",
    ownerId: null,
    active: true,
  };
  return [base, ...overrides.map((o) => ({ ...base, id: randomUUID(), ...o }))];
}

describe("expenseService.createExpense (Block 9, spec-FEAT-002)", () => {
  let originalDateNow: typeof Date;

  beforeEach(() => {
    originalDateNow = global.Date;
  });

  afterEach(() => {
    global.Date = originalDateNow;
    vi.restoreAllMocks();
  });

  it("creates an expense with automatic category resolution for a valid input without a marker (AC-01, AC-06)", async () => {
    const { createExpense } = await import("../../src/services/expense-service.ts");
    const prisma = fakePrismaClient(seedFor());

    // biome-ignore-next: fake client only exposes the methods the service exercises.
    const result = await createExpense({ prisma: prisma as never }, TEST_USER_ID, "café 1500");

    expect(result.outcome).toBe("created");
    if (result.outcome === "created") {
      expect(result.expense).toMatchObject({ categoryOrigin: "automatica" });
      expect(result.category).toBe("Comida");
      const created = prisma.__state.categories.find((c) => c.name === "Comida");
      expect(created).toBeDefined();
    }
    expect(prisma.expense.create).toHaveBeenCalledTimes(1);
  });

  it("returns rejected and touches no repository create when parseExpense rejects the input (AC-02)", async () => {
    const { createExpense } = await import("../../src/services/expense-service.ts");
    const prisma = fakePrismaClient(seedFor());

    // biome-ignore-next: fake client only exposes the methods the service exercises.
    const result = await createExpense({ prisma: prisma as never }, TEST_USER_ID, "");

    expect(result).toEqual({ outcome: "rejected", reason: "empty_left_segment" });
    expect(prisma.category.create).not.toHaveBeenCalled();
    expect(prisma.expense.create).not.toHaveBeenCalled();
  });

  it("creates a new own category and the expense for a marker naming a nonexistent category (AC-04)", async () => {
    const { createExpense } = await import("../../src/services/expense-service.ts");
    const prisma = fakePrismaClient(seedFor());

    const result = await createExpense(
      // biome-ignore-next: fake client only exposes the methods the service exercises.
      { prisma: prisma as never },
      TEST_USER_ID,
      "kiosco 1500 #golosinas",
    );

    expect(result.outcome).toBe("created");
    expect(prisma.category.create).toHaveBeenCalledTimes(1);
    expect(prisma.category.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "golosinas", ownerId: TEST_USER_ID }),
      }),
    );
    if (result.outcome === "created") {
      expect(result.expense).toMatchObject({ categoryOrigin: "marcador" });
      expect(result.category).toBe("golosinas");
    }
  });

  it("reuses an existing category when the marker normalizes to one already visible, without duplicating it (AC-05)", async () => {
    const { createExpense } = await import("../../src/services/expense-service.ts");
    const prisma = fakePrismaClient(seedFor());

    const result = await createExpense(
      // biome-ignore-next: fake client only exposes the methods the service exercises.
      { prisma: prisma as never },
      TEST_USER_ID,
      "kiosco 1500 #comida",
    );

    expect(result.outcome).toBe("created");
    expect(prisma.category.create).not.toHaveBeenCalled();
    if (result.outcome === "created") {
      const comida = prisma.__state.categories.find((c) => c.name === "Comida");
      expect(result.expense).toMatchObject({ categoryId: comida?.id });
      expect(result.category).toBe("Comida");
    }
  });

  it("rejects the whole expense and creates no category when the marker is unknown AND the amount is indeterminate (AC-07)", async () => {
    const { createExpense } = await import("../../src/services/expense-service.ts");
    const prisma = fakePrismaClient(seedFor());

    const result = await createExpense(
      // biome-ignore-next: fake client only exposes the methods the service exercises.
      { prisma: prisma as never },
      TEST_USER_ID,
      "kiosco #golosinas",
    );

    expect(result.outcome).toBe("rejected");
    expect(prisma.category.create).toHaveBeenCalledTimes(0);
  });

  it("persists currency ARS, channel texto, and the exact rawInput sent (AC-08)", async () => {
    const { createExpense } = await import("../../src/services/expense-service.ts");
    const prisma = fakePrismaClient(seedFor());
    const rawInput = "café 1500";

    // biome-ignore-next: fake client only exposes the methods the service exercises.
    const result = await createExpense({ prisma: prisma as never }, TEST_USER_ID, rawInput);

    expect(result.outcome).toBe("created");
    if (result.outcome === "created") {
      expect(result.expense).toMatchObject({
        currency: "ARS",
        channel: "texto",
        rawInput,
      });
    }
  });

  it("uses the server's own clock as referenceDate, never a field read from rawInput", async () => {
    const { createExpense } = await import("../../src/services/expense-service.ts");
    const prisma = fakePrismaClient(seedFor());

    const fixedNow = new Date("2026-08-19T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);

    try {
      // rawInput carries no date field at all (Block 7's schema exposes only `input: string`) --
      // this confirms the service itself never reaches into rawInput for a date, it always calls
      // `new Date()`.
      const result = await createExpense(
        // biome-ignore-next: fake client only exposes the methods the service exercises.
        { prisma: prisma as never },
        TEST_USER_ID,
        "café 1500",
      );

      expect(result.outcome).toBe("created");
      if (result.outcome === "created") {
        // The domain pipeline resolves "when" from `referenceDate` truncated to midnight (kb.md
        // "Cuando" -- no explicit temporal reference in the input) -- so the date component is
        // what proves `referenceDate` came from the fake system clock, not the full timestamp.
        expect(result.expense.when.toISOString().slice(0, 10)).toBe(
          fixedNow.toISOString().slice(0, 10),
        );
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns internal_error when the automatic category has no matching predefined row in DB (seed drift)", async () => {
    const { createExpense } = await import("../../src/services/expense-service.ts");
    // No "Comida" row seeded at all -- simulates a categorizer/seed desync.
    const prisma = fakePrismaClient([]);

    // biome-ignore-next: fake client only exposes the methods the service exercises.
    const result = await createExpense({ prisma: prisma as never }, TEST_USER_ID, "café 1500");

    expect(result).toEqual({ outcome: "internal_error" });
  });

  it("returns internal_error, without leaking the Prisma error, when expenseRepository.create throws", async () => {
    const { createExpense } = await import("../../src/services/expense-service.ts");
    const prisma = fakePrismaClient(seedFor());
    prisma.__setExpenseCreateImpl(() => {
      throw new Error("Prisma exploded: connection refused at db.internal:5432");
    });

    // biome-ignore-next: fake client only exposes the methods the service exercises.
    const result = await createExpense({ prisma: prisma as never }, TEST_USER_ID, "café 1500");

    expect(result).toEqual({ outcome: "internal_error" });
    expect(JSON.stringify(result)).not.toContain("Prisma exploded");
    expect(JSON.stringify(result)).not.toContain("db.internal");
  });

  it("logs the real thrown error to deps.logger, without rawInput, when expenseRepository.create throws", async () => {
    const { createExpense } = await import("../../src/services/expense-service.ts");
    const prisma = fakePrismaClient(seedFor());
    const thrown = new Error("Prisma exploded: connection refused at db.internal:5432");
    prisma.__setExpenseCreateImpl(() => {
      throw thrown;
    });
    const logger = { error: vi.fn() };
    const rawInput = "café 1500 #secreto-del-usuario";

    const result = await createExpense(
      // biome-ignore-next: fake client only exposes the methods the service exercises.
      { prisma: prisma as never, logger },
      TEST_USER_ID,
      rawInput,
    );

    expect(result).toEqual({ outcome: "internal_error" });
    expect(logger.error).toHaveBeenCalledTimes(1);
    const [loggedObj, loggedMsg] = logger.error.mock.calls[0] as [unknown, string];
    expect(loggedObj).toMatchObject({ err: thrown });
    expect(typeof loggedMsg).toBe("string");
    expect(JSON.stringify(loggedObj)).not.toContain(rawInput);
  });

  it("does not throw when deps.logger is omitted and expenseRepository.create throws", async () => {
    const { createExpense } = await import("../../src/services/expense-service.ts");
    const prisma = fakePrismaClient(seedFor());
    prisma.__setExpenseCreateImpl(() => {
      throw new Error("boom");
    });

    // biome-ignore-next: fake client only exposes the methods the service exercises.
    const result = await createExpense({ prisma: prisma as never }, TEST_USER_ID, "café 1500");

    expect(result).toEqual({ outcome: "internal_error" });
  });
});

describe("expenseService.listExpenses (Block 3, spec-FEAT-003a)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns { outcome: 'listed' } with expenses mapped to their presentation shape, category name resolved", async () => {
    const { listExpenses } = await import("../../src/services/expense-service.ts");
    const prisma = fakePrismaClient(seedFor());
    const row = fakeExpenseRow({
      category: {
        id: randomUUID(),
        name: "Delivery",
        nameNormalized: "delivery",
        ownerId: null,
        active: true,
      },
    });
    prisma.__setExpenseFindManyImpl(() => [row]);

    // biome-ignore-next: fake client only exposes the methods the service exercises.
    const result = await listExpenses({ prisma: prisma as never }, TEST_USER_ID, 50);

    expect(result).toEqual({
      outcome: "listed",
      expenses: [
        {
          id: row.id,
          amount: row.amount,
          place: row.place,
          when: row.when,
          category: "Delivery",
          categoryOrigin: row.categoryOrigin,
          description: row.description,
          name: row.name,
          type: row.type,
          currency: row.currency,
        },
      ],
    });
  });

  it("propagates the order returned by the repository without reordering", async () => {
    const { listExpenses } = await import("../../src/services/expense-service.ts");
    const prisma = fakePrismaClient(seedFor());
    // Deliberately not sorted by `when`, `createdAt` nor `id` -- the repository (Block 2) already
    // guarantees the ordering; the service must not touch it.
    const rowB = fakeExpenseRow({ place: "b" });
    const rowA = fakeExpenseRow({ place: "a" });
    const rowC = fakeExpenseRow({ place: "c" });
    prisma.__setExpenseFindManyImpl(() => [rowB, rowA, rowC]);

    // biome-ignore-next: fake client only exposes the methods the service exercises.
    const result = await listExpenses({ prisma: prisma as never }, TEST_USER_ID, 50);

    expect(result.outcome).toBe("listed");
    if (result.outcome === "listed") {
      expect(result.expenses.map((e) => e.id)).toEqual([rowB.id, rowA.id, rowC.id]);
    }
  });

  it("returns internal_error, without leaking the Prisma error, when the repository throws", async () => {
    const { listExpenses } = await import("../../src/services/expense-service.ts");
    const prisma = fakePrismaClient(seedFor());
    prisma.__setExpenseFindManyImpl(() => {
      throw new Error("Prisma exploded: connection refused at db.internal:5432");
    });

    // biome-ignore-next: fake client only exposes the methods the service exercises.
    const result = await listExpenses({ prisma: prisma as never }, TEST_USER_ID, 50);

    expect(result).toEqual({ outcome: "internal_error" });
    expect(JSON.stringify(result)).not.toContain("Prisma exploded");
    expect(JSON.stringify(result)).not.toContain("db.internal");
  });

  it("returns { outcome: 'listed' } with an empty list, never an error, for a user without expenses (AC-04)", async () => {
    const { listExpenses } = await import("../../src/services/expense-service.ts");
    const prisma = fakePrismaClient(seedFor());
    prisma.__setExpenseFindManyImpl(() => []);

    // biome-ignore-next: fake client only exposes the methods the service exercises.
    const result = await listExpenses({ prisma: prisma as never }, TEST_USER_ID, 50);

    expect(result).toEqual({ outcome: "listed", expenses: [] });
  });

  it("logs only the thrown error to deps.logger, with no expense row data attached, when the repository throws", async () => {
    const { listExpenses } = await import("../../src/services/expense-service.ts");
    const prisma = fakePrismaClient(seedFor());
    const thrown = new Error("Prisma exploded: connection refused at db.internal:5432");
    prisma.__setExpenseFindManyImpl(() => {
      throw thrown;
    });
    const logger = { error: vi.fn() };

    const result = await listExpenses(
      // biome-ignore-next: fake client only exposes the methods the service exercises.
      { prisma: prisma as never, logger },
      TEST_USER_ID,
      50,
    );

    expect(result).toEqual({ outcome: "internal_error" });
    expect(logger.error).toHaveBeenCalledTimes(1);
    const [loggedObj, loggedMsg] = logger.error.mock.calls[0] as [unknown, string];
    // findManyForUser throws before returning any row, so no expense -- and no rawInput --
    // ever enters this scope. The real invariant is an exact match (not toMatchObject, which
    // would let extra keys through unnoticed): the log carries only the error, never a partial
    // row or the caller's raw arguments, so a future change that starts attaching row data to
    // this log call fails here instead of leaking silently.
    expect(loggedObj).toEqual({ err: thrown });
    expect(typeof loggedMsg).toBe("string");
  });
});
