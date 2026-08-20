/**
 * Block 8 (spec-FEAT-002) -- src/repositories/category-repository.ts.
 *
 * Runs against `DATABASE_URL_TEST` (root `.env`). Reuses the seed's TEST_USER_ID and the 11
 * predefined categories as preexisting fixture data (Rule #0: never deleted/mutated by this
 * suite). Any category this suite creates for a test (own marker categories) is deleted in
 * `afterEach`, by its own id, never touching the predefined rows or the seeded user.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const apiRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
config({ path: path.resolve(apiRoot, "../../.env") });

const TEST_DATABASE_URL = process.env["DATABASE_URL_TEST"];

if (!TEST_DATABASE_URL) {
  throw new Error("DATABASE_URL_TEST must be set (root .env) to run apps/api's Prisma tests.");
}

describe("categoryRepository (Block 8, spec-FEAT-002)", () => {
  let prisma: InstanceType<typeof import("../../src/generated/prisma/client.ts").PrismaClient>;
  let TEST_USER_ID: string;

  const createdCategoryIds: string[] = [];

  beforeAll(async () => {
    const { PrismaClient } = await import("../../src/generated/prisma/client.ts");
    const { PrismaPg } = await import("@prisma/adapter-pg");
    const adapter = new PrismaPg({ connectionString: TEST_DATABASE_URL });
    prisma = new PrismaClient({ adapter });

    const { seed, TEST_USER_ID: seededId } = await import("../../prisma/seed.ts");
    await seed(prisma);
    TEST_USER_ID = seededId;
  });

  afterEach(async () => {
    if (createdCategoryIds.length > 0) {
      await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
      createdCategoryIds.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("findVisibleForUser returns the 11 predefined + 0 own for a freshly seeded user", async () => {
    const { findVisibleForUser } = await import("../../src/repositories/category-repository.ts");

    const visible = await findVisibleForUser(prisma, TEST_USER_ID);

    expect(visible).toHaveLength(11);
    for (const category of visible) {
      expect(category).toEqual({ name: expect.any(String), active: expect.any(Boolean) });
    }
  });

  it("create creates an own category that then appears in findVisibleForUser", async () => {
    const { create, findVisibleForUser } = await import(
      "../../src/repositories/category-repository.ts"
    );
    const { normalize } = await import("@ggasia/categorization");

    const name = `Test Category ${randomUUID()}`;
    const nameNormalized = normalize(name);

    const created = await create(prisma, { name, nameNormalized, ownerId: TEST_USER_ID });
    createdCategoryIds.push(created.id);

    expect(created.name).toBe(name);
    expect(created.ownerId).toBe(TEST_USER_ID);

    const visible = await findVisibleForUser(prisma, TEST_USER_ID);
    expect(visible.some((category) => category.name === name)).toBe(true);
  });

  it("create with a nameNormalized already existing for that ownerId throws the raw Prisma P2002", async () => {
    const { create } = await import("../../src/repositories/category-repository.ts");
    const { normalize } = await import("@ggasia/categorization");

    const name = `Duplicate Test Category ${randomUUID()}`;
    const nameNormalized = normalize(name);

    const first = await create(prisma, { name, nameNormalized, ownerId: TEST_USER_ID });
    createdCategoryIds.push(first.id);

    await expect(create(prisma, { name, nameNormalized, ownerId: TEST_USER_ID })).rejects.toMatchObject({
      code: "P2002",
    });
  });

  it("findPredefinedByName finds a seeded predefined category and returns null for an unknown name", async () => {
    const { findPredefinedByName } = await import(
      "../../src/repositories/category-repository.ts"
    );

    const found = await findPredefinedByName(prisma, "Comida");
    expect(found).not.toBeNull();
    expect(found?.name).toBe("Comida");
    expect(found?.ownerId).toBeNull();

    const notFound = await findPredefinedByName(prisma, `Nonexistent ${randomUUID()}`);
    expect(notFound).toBeNull();
  });

  it("findByNameForUser finds a predefined category, an own category, and returns null for an unknown name", async () => {
    const { findByNameForUser, create } = await import(
      "../../src/repositories/category-repository.ts"
    );
    const { normalize } = await import("@ggasia/categorization");

    const predefined = await findByNameForUser(prisma, TEST_USER_ID, "Comida");
    expect(predefined).not.toBeNull();
    expect(predefined?.name).toBe("Comida");
    expect(predefined?.ownerId).toBeNull();

    const name = `Test Category ${randomUUID()}`;
    const nameNormalized = normalize(name);
    const own = await create(prisma, { name, nameNormalized, ownerId: TEST_USER_ID });
    createdCategoryIds.push(own.id);

    const found = await findByNameForUser(prisma, TEST_USER_ID, name);
    expect(found?.id).toBe(own.id);
    expect(found?.ownerId).toBe(TEST_USER_ID);

    const notFound = await findByNameForUser(prisma, TEST_USER_ID, `Nonexistent ${randomUUID()}`);
    expect(notFound).toBeNull();
  });
});
