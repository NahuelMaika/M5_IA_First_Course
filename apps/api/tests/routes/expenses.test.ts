/**
 * Block 10 (spec-FEAT-002) -- src/routes/expenses.ts.
 *
 * Exercises `POST /expenses` end-to-end at the HTTP layer via `fastify.inject`, with only
 * `PrismaClient` faked (an in-memory `user`/`category`/`expense` store mirroring the shape the
 * real repositories -- Block 8 -- query against). `parseExpense` (from `@ggasia/domain`) and
 * `resolveCategoryName` (from `@ggasia/categorization`) run for real: this is the only layer where
 * the full request -> response chain (auth -> body validation -> service -> HTTP mapping) is
 * proven wired together, per Block 10's Required tests.
 */
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "../../src/generated/prisma/client.ts";

// Some of these tests are the first in the process to transform/load the compiled
// `@ggasia/domain` module through `vi.mock`'s dynamic `importOriginal`, which can take longer
// than Vitest's 5s default on a cold run -- observed flaking at 30s too once the suite runs
// serially (vitest.config.ts's `fileParallelism: false`, needed to avoid racing DB-dependent
// files against each other), so this stays generous rather than masking a real hang.
const TEST_TIMEOUT_MS = 60_000;

const TEST_USER_ID = "11111111-1111-1111-1111-111111111111";
const TEST_USER_EMAIL = "test@ggasia.test";
const UNKNOWN_USER_ID = "99999999-9999-9999-9999-999999999999";

// Spy on `parseExpense` while keeping its real implementation -- Block 10's Required tests demand
// proof that invalid-body (400) and unauthorized (covered by Block 6 already) requests never reach
// it. `importOriginal` keeps every other export of `@ggasia/domain` untouched.
vi.mock("@ggasia/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ggasia/domain")>();
  return {
    ...actual,
    parseExpense: vi.fn(actual.parseExpense),
  };
});

// `GET /expenses` tests (Block 4, spec-FEAT-003a) exercise the route layer only: `listExpenses`
// (Block 3) already has its own dedicated test suite, so it is mocked here to isolate query
// validation and HTTP response mapping without re-testing ordering/repository concerns.
vi.mock("../../src/services/expense-service.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/expense-service.ts")>();
  return {
    ...actual,
    listExpenses: vi.fn(),
  };
});

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
  let expenseCreateImpl: ((data: Record<string, unknown>) => unknown) | null = null;

  return {
    __state: { categories, expenses },
    __setExpenseCreateImpl(impl: typeof expenseCreateImpl) {
      expenseCreateImpl = impl;
    },
    $connect: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    user: {
      findUnique: vi.fn(async ({ where: { id } }: { where: { id: string } }) => {
        if (id === TEST_USER_ID) {
          return { id: TEST_USER_ID, email: TEST_USER_EMAIL };
        }
        return null;
      }),
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
      findUnique: vi.fn(async ({ where: { id } }: { where: { id: string } }) => {
        return categories.find((category) => category.id === id) ?? null;
      }),
      create: vi.fn(
        async ({ data }: { data: { name: string; nameNormalized: string; ownerId: string } }) => {
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
    },
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

describe("POST /expenses (Block 10, spec-FEAT-002)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 201 with the FR-13 shape for a full happy path (AC-01)", async () => {
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient(seedFor());
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });

    const response = await app.inject({
      method: "POST",
      url: "/expenses",
      headers: { "x-user-id": TEST_USER_ID },
      payload: { input: "café 1500" },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toMatchObject({
      amount: "1500.00",
      place: "café",
      category: "Comida",
      categoryOrigin: "automatica",
      description: "",
      name: "café",
      type: "Personal",
      currency: "ARS",
    });
    expect(typeof body.when).toBe("string");
    expect(new Date(body.when).toISOString()).toBe(body.when);
    // The route reads the category name straight off the service's result -- it must never query
    // Prisma directly for presentation mapping (`routes -> service -> repository`).
    expect(prisma.category.findUnique).not.toHaveBeenCalled();

    await app.close();
  }, TEST_TIMEOUT_MS);

  it("returns 401 when x-user-id is missing", async () => {
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient(seedFor());
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });

    const response = await app.inject({
      method: "POST",
      url: "/expenses",
      payload: { input: "café 1500" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "unauthorized" });

    await app.close();
  }, TEST_TIMEOUT_MS);

  it("returns 401 when x-user-id belongs to no user, and never invokes parseExpense", async () => {
    const { parseExpense } = await import("@ggasia/domain");
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient(seedFor());
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });

    const response = await app.inject({
      method: "POST",
      url: "/expenses",
      headers: { "x-user-id": UNKNOWN_USER_ID },
      payload: { input: "café 1500" },
    });

    expect(response.statusCode).toBe(401);
    expect(parseExpense).not.toHaveBeenCalled();

    await app.close();
  }, TEST_TIMEOUT_MS);

  it("returns 400 when the body has no input, and never invokes parseExpense", async () => {
    const { parseExpense } = await import("@ggasia/domain");
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient(seedFor());
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });

    const response = await app.inject({
      method: "POST",
      url: "/expenses",
      headers: { "x-user-id": TEST_USER_ID },
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(parseExpense).not.toHaveBeenCalled();

    await app.close();
  }, TEST_TIMEOUT_MS);

  it("returns 422 with the rejection reason when parseExpense rejects the input (AC-02)", async () => {
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient(seedFor());
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });

    // "sin monto" is a non-empty string, so it passes Zod (Block 7) and reaches `parseExpense`,
    // which rejects it for lacking a determinable amount.
    const response = await app.inject({
      method: "POST",
      url: "/expenses",
      headers: { "x-user-id": TEST_USER_ID },
      payload: { input: "sin monto" },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({ reason: "amount_indeterminate" });

    await app.close();
  }, TEST_TIMEOUT_MS);

  it("returns 413 when the body exceeds the 16 KB bodyLimit", async () => {
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient(seedFor());
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });

    const oversizedInput = "a".repeat(20_000);

    const response = await app.inject({
      method: "POST",
      url: "/expenses",
      headers: { "x-user-id": TEST_USER_ID, "content-type": "application/json" },
      payload: JSON.stringify({ input: oversizedInput }),
    });

    expect(response.statusCode).toBe(413);

    await app.close();
  }, TEST_TIMEOUT_MS);

  it("returns 500 with a generic body when the repository throws, without leaking the Prisma error", async () => {
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient(seedFor());
    prisma.__setExpenseCreateImpl(() => {
      throw new Error("Prisma exploded: connection refused at db.internal:5432");
    });
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });

    const response = await app.inject({
      method: "POST",
      url: "/expenses",
      headers: { "x-user-id": TEST_USER_ID },
      payload: { input: "café 1500" },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: "internal_error" });
    expect(response.body).not.toContain("Prisma exploded");
    expect(response.body).not.toContain("db.internal");

    await app.close();
  }, TEST_TIMEOUT_MS);
});

describe("GET /expenses (Block 4, spec-FEAT-003a)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with the serialized expense list (AC-01)", async () => {
    const { listExpenses } = await import("../../src/services/expense-service.ts");
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient(seedFor());
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });

    const when = new Date("2026-08-15T12:00:00.000Z");
    vi.mocked(listExpenses).mockResolvedValue({
      outcome: "listed",
      expenses: [
        {
          id: "11111111-2222-3333-4444-555555555555",
          amount: new Prisma.Decimal("1500"),
          place: "café",
          when,
          category: "Comida",
          categoryOrigin: "automatica",
          description: "",
          name: "café",
          type: "Personal",
          currency: "ARS",
        },
      ],
    });

    const response = await app.inject({
      method: "GET",
      url: "/expenses",
      headers: { "x-user-id": TEST_USER_ID },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.expenses).toHaveLength(1);
    expect(body.expenses[0]).toMatchObject({
      id: "11111111-2222-3333-4444-555555555555",
      amount: "1500.00",
      place: "café",
      category: "Comida",
      categoryOrigin: "automatica",
      description: "",
      name: "café",
      type: "Personal",
      currency: "ARS",
    });
    expect(body.expenses[0].when).toBe(when.toISOString());

    await app.close();
  }, TEST_TIMEOUT_MS);

  it("invokes the service with limit 50 when the query param is absent", async () => {
    const { listExpenses } = await import("../../src/services/expense-service.ts");
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient(seedFor());
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });
    vi.mocked(listExpenses).mockResolvedValue({ outcome: "listed", expenses: [] });

    const response = await app.inject({
      method: "GET",
      url: "/expenses",
      headers: { "x-user-id": TEST_USER_ID },
    });

    expect(response.statusCode).toBe(200);
    expect(listExpenses).toHaveBeenCalledWith(expect.any(Object), TEST_USER_ID, 50);

    await app.close();
  }, TEST_TIMEOUT_MS);

  it("invokes the service with the requested limit at both range edges (limit=200, limit=1)", async () => {
    const { listExpenses } = await import("../../src/services/expense-service.ts");
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient(seedFor());
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });
    vi.mocked(listExpenses).mockResolvedValue({ outcome: "listed", expenses: [] });

    const responseUpper = await app.inject({
      method: "GET",
      url: "/expenses?limit=200",
      headers: { "x-user-id": TEST_USER_ID },
    });
    expect(responseUpper.statusCode).toBe(200);
    expect(listExpenses).toHaveBeenLastCalledWith(expect.any(Object), TEST_USER_ID, 200);

    const responseLower = await app.inject({
      method: "GET",
      url: "/expenses?limit=1",
      headers: { "x-user-id": TEST_USER_ID },
    });
    expect(responseLower.statusCode).toBe(200);
    expect(listExpenses).toHaveBeenLastCalledWith(expect.any(Object), TEST_USER_ID, 1);

    await app.close();
  }, TEST_TIMEOUT_MS);

  it("returns 400 without invoking the service for limit=0, limit=201 and limit=abc (AC-02)", async () => {
    const { listExpenses } = await import("../../src/services/expense-service.ts");
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient(seedFor());
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });

    for (const invalidLimit of ["0", "201", "abc"]) {
      const response = await app.inject({
        method: "GET",
        url: `/expenses?limit=${invalidLimit}`,
        headers: { "x-user-id": TEST_USER_ID },
      });
      expect(response.statusCode).toBe(400);
    }
    expect(listExpenses).not.toHaveBeenCalled();

    await app.close();
  }, TEST_TIMEOUT_MS);

  it("returns 401 without invoking the service when x-user-id is missing (AC-03)", async () => {
    const { listExpenses } = await import("../../src/services/expense-service.ts");
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient(seedFor());
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });

    const response = await app.inject({ method: "GET", url: "/expenses" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "unauthorized" });
    expect(listExpenses).not.toHaveBeenCalled();

    await app.close();
  }, TEST_TIMEOUT_MS);

  it("returns 401 with the same generic body when x-user-id belongs to no user (AC-03)", async () => {
    const { listExpenses } = await import("../../src/services/expense-service.ts");
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient(seedFor());
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });

    const response = await app.inject({
      method: "GET",
      url: "/expenses",
      headers: { "x-user-id": UNKNOWN_USER_ID },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "unauthorized" });
    expect(listExpenses).not.toHaveBeenCalled();

    await app.close();
  }, TEST_TIMEOUT_MS);

  it("returns 500 without leaking the internal error when the service reports internal_error", async () => {
    const { listExpenses } = await import("../../src/services/expense-service.ts");
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient(seedFor());
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });
    vi.mocked(listExpenses).mockResolvedValue({ outcome: "internal_error" });

    const response = await app.inject({
      method: "GET",
      url: "/expenses",
      headers: { "x-user-id": TEST_USER_ID },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: "internal_error" });

    await app.close();
  }, TEST_TIMEOUT_MS);
});
