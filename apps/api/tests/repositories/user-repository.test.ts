/**
 * Block 8 (spec-FEAT-002) -- src/repositories/user-repository.ts.
 *
 * Runs against `DATABASE_URL_TEST` (root `.env`), never against `DATABASE_URL` (development).
 * Reuses the seed's `TEST_USER_ID`/`TEST_USER_EMAIL` (Block 3) as preexisting fixture data --
 * Rule #0 (testing.instructions.md) forbids deleting/mutating it, and this test does neither: it
 * only reads.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const apiRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
config({ path: path.resolve(apiRoot, "../../.env") });

const TEST_DATABASE_URL = process.env["DATABASE_URL_TEST"];

if (!TEST_DATABASE_URL) {
  throw new Error("DATABASE_URL_TEST must be set (root .env) to run apps/api's Prisma tests.");
}

describe("userRepository.findById (Block 8, spec-FEAT-002)", () => {
  let prisma: InstanceType<typeof import("../../src/generated/prisma/client.ts").PrismaClient>;

  beforeAll(async () => {
    const { PrismaClient } = await import("../../src/generated/prisma/client.ts");
    const { PrismaPg } = await import("@prisma/adapter-pg");
    const adapter = new PrismaPg({ connectionString: TEST_DATABASE_URL });
    prisma = new PrismaClient({ adapter });

    // Ensure the fixture the seed normally provides is present, without depending on
    // Block 3's seed script having been run beforehand in this environment.
    const { seed } = await import("../../prisma/seed.ts");
    await seed(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("returns the seeded user for TEST_USER_ID", async () => {
    const { findById } = await import("../../src/repositories/user-repository.ts");
    const { TEST_USER_ID, TEST_USER_EMAIL } = await import("../../prisma/seed.ts");

    const user = await findById(prisma, TEST_USER_ID);

    expect(user).toEqual({ id: TEST_USER_ID, email: TEST_USER_EMAIL });
  });

  it("returns null for a nonexistent id", async () => {
    const { findById } = await import("../../src/repositories/user-repository.ts");

    const user = await findById(prisma, randomUUID());

    expect(user).toBeNull();
  });
});

describe("userRepository.create / findByEmail (Block 4, spec-FEAT-004a)", () => {
  let prisma: InstanceType<typeof import("../../src/generated/prisma/client.ts").PrismaClient>;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const { PrismaClient } = await import("../../src/generated/prisma/client.ts");
    const { PrismaPg } = await import("@prisma/adapter-pg");
    const adapter = new PrismaPg({ connectionString: TEST_DATABASE_URL });
    prisma = new PrismaClient({ adapter });
  });

  afterAll(async () => {
    // Deletes only the throwaway users this suite created -- never touches the seeded
    // TEST_USER_ID fixture (Rule #0, testing.instructions.md).
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });

  it("create inserts a User with passwordHash and returns it without exposing the hash", async () => {
    const { create } = await import("../../src/repositories/user-repository.ts");
    const email = `user-repo-create-${randomUUID()}@ggasia.local`;

    const user = await create(prisma, email, "test-hash");
    createdUserIds.push(user.id);

    expect(user.email).toBe(email);
    expect(typeof user.id).toBe("string");
    expect(user).not.toHaveProperty("passwordHash");

    const stored = await prisma.user.findUnique({ where: { id: user.id } });
    expect(stored?.passwordHash).toBe("test-hash");
  });

  it("findByEmail with an existing email returns the record with passwordHash", async () => {
    const { create, findByEmail } = await import("../../src/repositories/user-repository.ts");
    const email = `user-repo-findbyemail-${randomUUID()}@ggasia.local`;
    const created = await create(prisma, email, "test-hash-2");
    createdUserIds.push(created.id);

    const found = await findByEmail(prisma, email);

    expect(found).toEqual({ id: created.id, email, passwordHash: "test-hash-2" });
  });

  it("findByEmail with a nonexistent email returns null", async () => {
    const { findByEmail } = await import("../../src/repositories/user-repository.ts");

    const found = await findByEmail(prisma, `user-repo-nonexistent-${randomUUID()}@ggasia.local`);

    expect(found).toBeNull();
  });

  // Regression test for threat-FEAT-004a.md's R1 finding: `User.email` is `@db.Citext` precisely
  // so lookups do not depend on the exact capitalization the client sent.
  it("findByEmail is case-insensitive thanks to @db.Citext", async () => {
    const { create, findByEmail } = await import("../../src/repositories/user-repository.ts");
    const email = `User-Repo-Case-${randomUUID()}@GGasia.local`;
    const created = await create(prisma, email, "test-hash-3");
    createdUserIds.push(created.id);

    const found = await findByEmail(prisma, email.toLowerCase());

    expect(found?.id).toBe(created.id);
  });
});
