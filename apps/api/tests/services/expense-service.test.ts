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

/**
 * One row in the fake `expense` table backing `findFirst`/`update`/`delete` (spec-FEAT-005a
 * Block 4). Deliberately flat (`categoryId`, no nested `category`) -- same shape Prisma itself
 * stores; the nested `category` relation is synthesized on read by `update`/`findFirst` just like
 * a real `include: { category: true }` would, by looking `categoryId` up in the `categories`
 * store below.
 */
interface FakeExpenseRecord {
  id: string;
  userId: string;
  amount: string;
  place: string;
  when: Date;
  categoryId: string;
  categoryOrigin: string;
  description: string;
  name: string;
  type: string;
  currency: string;
  rawInput: string;
  channel: string;
  createdAt: Date;
}

function fakePrismaClient(seedCategories: FakeCategory[], seedExpenses: FakeExpenseRecord[] = []) {
  const categories: FakeCategory[] = [...seedCategories];
  const expenses: Record<string, unknown>[] = seedExpenses.map((e) => ({ ...e }));
  let expenseCreateImpl: ((data: unknown) => unknown) | null = null;
  let expenseFindManyImpl: ((args: unknown) => unknown) | null = null;
  let expenseFindFirstImpl: ((args: unknown) => unknown) | null = null;
  let expenseUpdateImpl: ((args: unknown) => unknown) | null = null;
  let expenseDeleteImpl: ((args: unknown) => unknown) | null = null;

  return {
    __state: { categories, expenses },
    __setExpenseCreateImpl(impl: ((data: unknown) => unknown) | null) {
      expenseCreateImpl = impl;
    },
    __setExpenseFindManyImpl(impl: ((args: unknown) => unknown) | null) {
      expenseFindManyImpl = impl;
    },
    __setExpenseFindFirstImpl(impl: ((args: unknown) => unknown) | null) {
      expenseFindFirstImpl = impl;
    },
    __setExpenseUpdateImpl(impl: ((args: unknown) => unknown) | null) {
      expenseUpdateImpl = impl;
    },
    __setExpenseDeleteImpl(impl: ((args: unknown) => unknown) | null) {
      expenseDeleteImpl = impl;
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
      findFirst: vi.fn(async (args: { where: { id: string; userId: string } }) => {
        if (expenseFindFirstImpl) {
          return expenseFindFirstImpl(args);
        }
        const found = expenses.find(
          (e) => e.id === args.where.id && e.userId === args.where.userId,
        );
        return found ?? null;
      }),
      update: vi.fn(
        async (args: { where: { id: string }; data: Record<string, unknown> }) => {
          if (expenseUpdateImpl) {
            return expenseUpdateImpl(args);
          }
          const idx = expenses.findIndex((e) => e.id === args.where.id);
          if (idx === -1) {
            throw new Error("Fake Prisma: An operation failed because it depends on one or more records that were required but not found. (P2025)");
          }
          expenses[idx] = { ...expenses[idx], ...args.data };
          const categoryId = expenses[idx].categoryId as string;
          const category = categories.find((c) => c.id === categoryId) ?? null;
          return { ...expenses[idx], category };
        },
      ),
      delete: vi.fn(async (args: { where: { id: string } }) => {
        if (expenseDeleteImpl) {
          return expenseDeleteImpl(args);
        }
        const idx = expenses.findIndex((e) => e.id === args.where.id);
        if (idx === -1) {
          throw new Error("Fake Prisma: An operation failed because it depends on one or more records that were required but not found. (P2025)");
        }
        const [removed] = expenses.splice(idx, 1);
        return removed;
      }),
    },
  };
}

/**
 * Seeds one flat expense row (spec-FEAT-005a Block 4) -- the shape `findByIdForUser`/`update`/
 * `remove` operate on, distinct from `fakeExpenseRow` above (which nests a resolved `category`,
 * the shape `findManyForUser`'s `include` produces for `listExpenses`).
 */
function fakeExpenseSeed(overrides: Partial<FakeExpenseRecord> = {}): FakeExpenseRecord {
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
    ...overrides,
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

  it("persists channel: 'texto' when createExpense is called without the 4th argument (Block 2, spec-FEAT-006, no regression)", async () => {
    const { createExpense } = await import("../../src/services/expense-service.ts");
    const prisma = fakePrismaClient(seedFor());

    // biome-ignore-next: fake client only exposes the methods the service exercises.
    const result = await createExpense({ prisma: prisma as never }, TEST_USER_ID, "café 1500");

    expect(result.outcome).toBe("created");
    if (result.outcome === "created") {
      expect(result.expense).toMatchObject({ channel: "texto" });
    }
    expect(prisma.expense.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ channel: "texto" }) }),
    );
  });

  it("persists channel: 'audio' when createExpense is called with 'audio' as the 4th argument (Block 2, spec-FEAT-006)", async () => {
    const { createExpense } = await import("../../src/services/expense-service.ts");
    const prisma = fakePrismaClient(seedFor());

    const result = await createExpense(
      // biome-ignore-next: fake client only exposes the methods the service exercises.
      { prisma: prisma as never },
      TEST_USER_ID,
      "café 1500",
      "audio",
    );

    expect(result.outcome).toBe("created");
    if (result.outcome === "created") {
      expect(result.expense).toMatchObject({ channel: "audio" });
    }
    expect(prisma.expense.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ channel: "audio" }) }),
    );
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

const OTHER_USER_ID = "22222222-2222-2222-2222-222222222222";

describe("expenseService.updateExpense (Block 4, spec-FEAT-005a)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("updates Amount/Place/Date of the user's own expense (AC-01)", async () => {
    const { updateExpense } = await import("../../src/services/expense-service.ts");
    const { Prisma } = await import("../../src/generated/prisma/client.ts");
    const categories = seedFor();
    const ownCategoryId = categories[0].id;
    const expense = fakeExpenseSeed({ categoryId: ownCategoryId });
    const prisma = fakePrismaClient(categories, [expense]);

    const result = await updateExpense(
      // biome-ignore-next: fake client only exposes the methods the service exercises.
      { prisma: prisma as never },
      TEST_USER_ID,
      expense.id,
      {
        amount: new Prisma.Decimal("2500.00"),
        place: "Nuevo lugar",
        when: new Date("2026-08-15T00:00:00.000Z"),
      },
    );

    expect(result.outcome).toBe("updated");
    if (result.outcome === "updated") {
      expect(result.expense).toMatchObject({
        place: "Nuevo lugar",
        when: new Date("2026-08-15T00:00:00.000Z"),
      });
      expect(result.expense.amount.toString()).toBe("2500");
    }
  });

  it("updates the Descripción of the user's own expense, including clearing it to \"\" -- AC-11", async () => {
    const { updateExpense } = await import("../../src/services/expense-service.ts");
    const categories = seedFor();
    const ownCategoryId = categories[0].id;
    const expense = fakeExpenseSeed({ categoryId: ownCategoryId });
    const prisma = fakePrismaClient(categories, [expense]);

    const result = await updateExpense(
      // biome-ignore-next: fake client only exposes the methods the service exercises.
      { prisma: prisma as never },
      TEST_USER_ID,
      expense.id,
      { description: "Nota del gasto" },
    );

    expect(result.outcome).toBe("updated");
    if (result.outcome === "updated") {
      expect(result.expense.description).toBe("Nota del gasto");
    }
  });

  it("returns 'not_found' for a nonexistent expense", async () => {
    const { updateExpense } = await import("../../src/services/expense-service.ts");
    const prisma = fakePrismaClient(seedFor());

    const result = await updateExpense(
      // biome-ignore-next: fake client only exposes the methods the service exercises.
      { prisma: prisma as never },
      TEST_USER_ID,
      randomUUID(),
      { place: "Nuevo lugar" },
    );

    expect(result).toEqual({ outcome: "not_found" });
  });

  it("returns 'not_found' for another user's expense (AC-02)", async () => {
    const { updateExpense } = await import("../../src/services/expense-service.ts");
    const categories = seedFor();
    const expense = fakeExpenseSeed({ userId: OTHER_USER_ID, categoryId: categories[0].id });
    const prisma = fakePrismaClient(categories, [expense]);

    const result = await updateExpense(
      // biome-ignore-next: fake client only exposes the methods the service exercises.
      { prisma: prisma as never },
      TEST_USER_ID,
      expense.id,
      { place: "Nuevo lugar" },
    );

    expect(result).toEqual({ outcome: "not_found" });
  });

  it("preserves the current category when the patch only carries 'place' (AC-03)", async () => {
    const { updateExpense } = await import("../../src/services/expense-service.ts");
    const categories = seedFor();
    const ownCategoryId = categories[0].id;
    const expense = fakeExpenseSeed({ categoryId: ownCategoryId });
    const prisma = fakePrismaClient(categories, [expense]);

    const result = await updateExpense(
      // biome-ignore-next: fake client only exposes the methods the service exercises.
      { prisma: prisma as never },
      TEST_USER_ID,
      expense.id,
      { place: "Nuevo lugar" },
    );

    expect(result.outcome).toBe("updated");
    if (result.outcome === "updated") {
      expect(result.expense.categoryId).toBe(ownCategoryId);
    }
    expect(prisma.category.findMany).not.toHaveBeenCalled();
  });

  it("reassigns the category when the patch carries a valid categoryId (AC-04)", async () => {
    const { updateExpense } = await import("../../src/services/expense-service.ts");
    const categories = seedFor([{ ownerId: TEST_USER_ID, name: "Otra" }]);
    const originalCategoryId = categories[0].id;
    const newCategoryId = categories[1].id;
    const expense = fakeExpenseSeed({ categoryId: originalCategoryId });
    const prisma = fakePrismaClient(categories, [expense]);

    const result = await updateExpense(
      // biome-ignore-next: fake client only exposes the methods the service exercises.
      { prisma: prisma as never },
      TEST_USER_ID,
      expense.id,
      { categoryId: newCategoryId },
    );

    expect(result.outcome).toBe("updated");
    if (result.outcome === "updated") {
      expect(result.expense.categoryId).toBe(newCategoryId);
    }
  });

  it("returns 'invalid_category' for a categoryId belonging to another user or a nonexistent predefined one", async () => {
    const { updateExpense } = await import("../../src/services/expense-service.ts");
    const categories = seedFor();
    const expense = fakeExpenseSeed({ categoryId: categories[0].id });
    const prisma = fakePrismaClient(categories, [expense]);
    const foreignCategoryId = randomUUID();

    const result = await updateExpense(
      // biome-ignore-next: fake client only exposes the methods the service exercises.
      { prisma: prisma as never },
      TEST_USER_ID,
      expense.id,
      { categoryId: foreignCategoryId },
    );

    expect(result).toEqual({ outcome: "invalid_category" });
    expect(prisma.expense.update).not.toHaveBeenCalled();
  });

  it("never invokes resolveCategoryName/createCategorizer", async () => {
    const categorization = await import("@ggasia/categorization");
    const resolveSpy = vi.spyOn(categorization, "resolveCategoryName");
    const createCategorizerSpy = vi.spyOn(categorization, "createCategorizer");
    const { updateExpense } = await import("../../src/services/expense-service.ts");
    const categories = seedFor([{ ownerId: TEST_USER_ID, name: "Otra" }]);
    const expense = fakeExpenseSeed({ categoryId: categories[0].id });
    const prisma = fakePrismaClient(categories, [expense]);

    await updateExpense(
      // biome-ignore-next: fake client only exposes the methods the service exercises.
      { prisma: prisma as never },
      TEST_USER_ID,
      expense.id,
      { categoryId: categories[1].id },
    );
    await updateExpense(
      // biome-ignore-next: fake client only exposes the methods the service exercises.
      { prisma: prisma as never },
      TEST_USER_ID,
      expense.id,
      { place: "Otro lugar" },
    );

    expect(resolveSpy).not.toHaveBeenCalled();
    expect(createCategorizerSpy).not.toHaveBeenCalled();
  });

  it("returns 'internal_error' and logs without exposing the real error, given a simulated Prisma failure", async () => {
    const { updateExpense } = await import("../../src/services/expense-service.ts");
    const categories = seedFor();
    const expense = fakeExpenseSeed({ categoryId: categories[0].id });
    const prisma = fakePrismaClient(categories, [expense]);
    const thrown = new Error("Prisma exploded: connection refused at db.internal:5432");
    prisma.__setExpenseUpdateImpl(() => {
      throw thrown;
    });
    const logger = { error: vi.fn() };

    const result = await updateExpense(
      // biome-ignore-next: fake client only exposes the methods the service exercises.
      { prisma: prisma as never, logger },
      TEST_USER_ID,
      expense.id,
      { place: "Nuevo lugar" },
    );

    expect(result).toEqual({ outcome: "internal_error" });
    expect(JSON.stringify(result)).not.toContain("Prisma exploded");
    expect(JSON.stringify(result)).not.toContain("db.internal");
    expect(logger.error).toHaveBeenCalledTimes(1);
    const [loggedObj, loggedMsg] = logger.error.mock.calls[0] as [unknown, string];
    expect(loggedObj).toMatchObject({ err: thrown });
    expect(typeof loggedMsg).toBe("string");
  });
});

describe("expenseService.deleteExpense (Block 4, spec-FEAT-005a)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("deletes the user's own expense (AC-05)", async () => {
    const { deleteExpense } = await import("../../src/services/expense-service.ts");
    const categories = seedFor();
    const expense = fakeExpenseSeed({ categoryId: categories[0].id });
    const prisma = fakePrismaClient(categories, [expense]);

    const result = await deleteExpense(
      // biome-ignore-next: fake client only exposes the methods the service exercises.
      { prisma: prisma as never },
      TEST_USER_ID,
      expense.id,
    );

    expect(result).toEqual({ outcome: "deleted" });
    expect(prisma.__state.expenses.find((e) => e.id === expense.id)).toBeUndefined();
  });

  it("returns 'not_found' for a nonexistent expense", async () => {
    const { deleteExpense } = await import("../../src/services/expense-service.ts");
    const prisma = fakePrismaClient(seedFor());

    const result = await deleteExpense(
      // biome-ignore-next: fake client only exposes the methods the service exercises.
      { prisma: prisma as never },
      TEST_USER_ID,
      randomUUID(),
    );

    expect(result).toEqual({ outcome: "not_found" });
  });

  it("returns 'not_found' for another user's expense (AC-07)", async () => {
    const { deleteExpense } = await import("../../src/services/expense-service.ts");
    const categories = seedFor();
    const expense = fakeExpenseSeed({ userId: OTHER_USER_ID, categoryId: categories[0].id });
    const prisma = fakePrismaClient(categories, [expense]);

    const result = await deleteExpense(
      // biome-ignore-next: fake client only exposes the methods the service exercises.
      { prisma: prisma as never },
      TEST_USER_ID,
      expense.id,
    );

    expect(result).toEqual({ outcome: "not_found" });
    expect(prisma.__state.expenses.find((e) => e.id === expense.id)).toBeDefined();
  });

  it("returns 'internal_error' and logs without exposing the real error, given a simulated Prisma failure", async () => {
    const { deleteExpense } = await import("../../src/services/expense-service.ts");
    const categories = seedFor();
    const expense = fakeExpenseSeed({ categoryId: categories[0].id });
    const prisma = fakePrismaClient(categories, [expense]);
    const thrown = new Error("Prisma exploded: connection refused at db.internal:5432");
    prisma.__setExpenseDeleteImpl(() => {
      throw thrown;
    });
    const logger = { error: vi.fn() };

    const result = await deleteExpense(
      // biome-ignore-next: fake client only exposes the methods the service exercises.
      { prisma: prisma as never, logger },
      TEST_USER_ID,
      expense.id,
    );

    expect(result).toEqual({ outcome: "internal_error" });
    expect(JSON.stringify(result)).not.toContain("Prisma exploded");
    expect(JSON.stringify(result)).not.toContain("db.internal");
    expect(logger.error).toHaveBeenCalledTimes(1);
    const [loggedObj, loggedMsg] = logger.error.mock.calls[0] as [unknown, string];
    expect(loggedObj).toMatchObject({ err: thrown });
    expect(typeof loggedMsg).toBe("string");
  });
});
