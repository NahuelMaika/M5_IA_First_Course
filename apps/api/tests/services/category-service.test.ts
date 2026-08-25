/**
 * Block 5 (spec-FEAT-005a) -- src/services/category-service.ts.
 *
 * Fully mocked at the Prisma boundary, same convention as expense-service.test.ts: only
 * `PrismaClient` is faked -- an in-memory `category` store shaped like what
 * `category-repository.ts`'s `findVisibleForUserWithId` queries against.
 */
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

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
  let categoryFindManyImpl: ((args: unknown) => unknown) | null = null;

  return {
    __state: { categories },
    __setCategoryFindManyImpl(impl: ((args: unknown) => unknown) | null) {
      categoryFindManyImpl = impl;
    },
    category: {
      findMany: vi.fn(async (args: { where: { OR: Array<{ ownerId: string | null }> } }) => {
        if (categoryFindManyImpl) {
          return categoryFindManyImpl(args);
        }
        return categories.filter((category) =>
          args.where.OR.some((clause) => category.ownerId === clause.ownerId),
        );
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

describe("categoryService.listCategories (Block 5, spec-FEAT-005a)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the categories visible to the user (AC-15)", async () => {
    const { listCategories } = await import("../../src/services/category-service.ts");
    const categories = seedFor([{ ownerId: TEST_USER_ID, name: "Otra" }]);
    const prisma = fakePrismaClient(categories);

    // biome-ignore-next: fake client only exposes the methods the service exercises.
    const result = await listCategories({ prisma: prisma as never }, TEST_USER_ID);

    expect(result).toEqual({
      outcome: "listed",
      categories: [
        { id: categories[0].id, name: categories[0].name, active: categories[0].active },
        { id: categories[1].id, name: categories[1].name, active: categories[1].active },
      ],
    });
  });

  it("returns 'internal_error', without exposing the real error, given a simulated Prisma failure", async () => {
    const { listCategories } = await import("../../src/services/category-service.ts");
    const prisma = fakePrismaClient(seedFor());
    const thrown = new Error("Prisma exploded: connection refused at db.internal:5432");
    prisma.__setCategoryFindManyImpl(() => {
      throw thrown;
    });
    const logger = { error: vi.fn() };

    const result = await listCategories(
      // biome-ignore-next: fake client only exposes the methods the service exercises.
      { prisma: prisma as never, logger },
      TEST_USER_ID,
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
