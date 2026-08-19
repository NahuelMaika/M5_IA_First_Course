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
