/**
 * Block 3 (spec-FEAT-004a) -- src/repositories/session-repository.ts.
 *
 * Runs against `DATABASE_URL_TEST` (root `.env`), same pattern as
 * `user-repository.test.ts`/`expense-repository.test.ts`. Creates its own throwaway `User` (Block
 * 1 makes `passwordHash` required) in `beforeAll` and deletes it in `afterAll` (Rule #0,
 * testing.instructions.md) -- the seeded `TEST_USER_ID` fixture is never mutated by this suite,
 * only referenced indirectly via a fresh user id created here.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID, createHash } from "node:crypto";
import { config } from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const apiRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
config({ path: path.resolve(apiRoot, "../../.env") });

const TEST_DATABASE_URL = process.env["DATABASE_URL_TEST"];

if (!TEST_DATABASE_URL) {
  throw new Error("DATABASE_URL_TEST must be set (root .env) to run apps/api's Prisma tests.");
}

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

describe("sessionRepository (Block 3, spec-FEAT-004a)", () => {
  let prisma: InstanceType<typeof import("../../src/generated/prisma/client.ts").PrismaClient>;
  let userId: string;

  beforeAll(async () => {
    const { PrismaClient } = await import("../../src/generated/prisma/client.ts");
    const { PrismaPg } = await import("@prisma/adapter-pg");
    const adapter = new PrismaPg({ connectionString: TEST_DATABASE_URL });
    prisma = new PrismaClient({ adapter });

    userId = randomUUID();
    await prisma.user.create({
      data: {
        id: userId,
        email: `session-repo-${userId}@ggasia.local`,
        passwordHash: "test-hash",
      },
    });
  });

  afterAll(async () => {
    // Cascades to any Session rows this suite created for this user.
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("create returns a raw token that does NOT match what is stored in Session.token", async () => {
    const { create } = await import("../../src/repositories/session-repository.ts");

    const { token } = await create(prisma, userId);

    const stored = await prisma.session.findUnique({ where: { token: hashToken(token) } });
    expect(stored).not.toBeNull();
    expect(stored?.token).not.toBe(token);
  });

  it("create sets expiresAt to 7 days from creation (NFR-02/AC-04)", async () => {
    const { create } = await import("../../src/repositories/session-repository.ts");

    const before = Date.now();
    const { expiresAt } = await create(prisma, userId);
    const after = Date.now();

    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + sevenDaysMs - 5000);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(after + sevenDaysMs + 5000);
  });

  it("findValid with a freshly created token returns the correct userId", async () => {
    const { create, findValid } = await import("../../src/repositories/session-repository.ts");

    const { token } = await create(prisma, userId);
    const result = await findValid(prisma, token);

    expect(result).toEqual({ userId });
  });

  it("findValid with a nonexistent token returns null", async () => {
    const { findValid } = await import("../../src/repositories/session-repository.ts");

    const result = await findValid(prisma, "this-token-was-never-created");

    expect(result).toBeNull();
  });

  it("findValid with an expired token returns null", async () => {
    const { findValid } = await import("../../src/repositories/session-repository.ts");

    const rawToken = randomUUID();
    await prisma.session.create({
      data: {
        userId,
        token: hashToken(rawToken),
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    const result = await findValid(prisma, rawToken);

    expect(result).toBeNull();
  });

  it("invalidate makes a subsequent findValid with the same token return null", async () => {
    const { create, findValid, invalidate } = await import(
      "../../src/repositories/session-repository.ts"
    );

    const { token } = await create(prisma, userId);
    expect(await findValid(prisma, token)).toEqual({ userId });

    await invalidate(prisma, token);

    expect(await findValid(prisma, token)).toBeNull();
  });

  it("invalidate on a nonexistent token does not throw (idempotent)", async () => {
    const { invalidate } = await import("../../src/repositories/session-repository.ts");

    await expect(invalidate(prisma, "never-existed-token")).resolves.not.toThrow();
  });
});
