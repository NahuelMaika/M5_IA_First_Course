/**
 * Block 9 (spec-FEAT-004a) -- src/services/auth-service.ts.
 *
 * Runs against `DATABASE_URL_TEST` (root `.env`) for the user/session repository calls, same
 * pattern as `session-repository.test.ts`/`user-repository.test.ts`: creates its own throwaway
 * `User` rows and deletes them in `afterAll` (Rule #0, testing.instructions.md), never touching
 * the seeded `TEST_USER_ID` fixture. `login-throttle` is in-memory (no I/O) and is exercised for
 * real, except in the "throttled short-circuit" test, where `userRepository`/`sessionRepository`
 * are spied on to prove they are never invoked once the throttle already blocks the email
 * (threat-FEAT-004a.md R3 -- throttle checked before any DB/argon2 work).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const apiRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
config({ path: path.resolve(apiRoot, "../../.env") });

const TEST_DATABASE_URL = process.env["DATABASE_URL_TEST"];

if (!TEST_DATABASE_URL) {
  throw new Error("DATABASE_URL_TEST must be set (root .env) to run apps/api's Prisma tests.");
}

function uniqueEmail(label: string): string {
  return `auth-service-${label}-${randomUUID()}@ggasia.local`;
}

describe("authService (Block 9, spec-FEAT-004a)", () => {
  let prisma: InstanceType<typeof import("../../src/generated/prisma/client.ts").PrismaClient>;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const { PrismaClient } = await import("../../src/generated/prisma/client.ts");
    const { PrismaPg } = await import("@prisma/adapter-pg");
    const adapter = new PrismaPg({ connectionString: TEST_DATABASE_URL });
    prisma = new PrismaClient({ adapter });
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("register with a new email creates the user, hashes the password, and returns outcome created with token/expiresAt", async () => {
    const { register } = await import("../../src/services/auth-service.ts");
    const email = uniqueEmail("register-new");

    const result = await register({ prisma }, email, "correct-password-123");

    expect(result.outcome).toBe("created");
    if (result.outcome === "created") {
      createdUserIds.push(result.userId);
      expect(typeof result.token).toBe("string");
      expect(result.expiresAt).toBeInstanceOf(Date);

      const stored = await prisma.user.findUnique({ where: { id: result.userId } });
      expect(stored?.passwordHash).not.toBe("correct-password-123");
      expect(stored?.passwordHash).toMatch(/^\$argon2/);
    }
  });

  it("register with an already existing email returns duplicate_email WITHOUT creating a second user", async () => {
    const { register } = await import("../../src/services/auth-service.ts");
    const email = uniqueEmail("register-dup");

    const first = await register({ prisma }, email, "correct-password-123");
    expect(first.outcome).toBe("created");
    if (first.outcome === "created") createdUserIds.push(first.userId);

    const second = await register({ prisma }, email, "another-password-456");

    expect(second).toEqual({ outcome: "duplicate_email" });
    const count = await prisma.user.count({ where: { email } });
    expect(count).toBe(1);
  });

  it("login with correct credentials returns outcome success with a new token", async () => {
    const { register, login } = await import("../../src/services/auth-service.ts");
    const email = uniqueEmail("login-success");
    const password = "correct-password-123";
    const registered = await register({ prisma }, email, password);
    if (registered.outcome === "created") createdUserIds.push(registered.userId);

    const result = await login({ prisma }, email, password);

    expect(result.outcome).toBe("success");
    if (result.outcome === "success" && registered.outcome === "created") {
      expect(result.userId).toBe(registered.userId);
      // R4: login always mints a brand-new token, never reuses the one from register.
      expect(result.token).not.toBe(registered.token);
    }
  });

  it("login with a nonexistent email returns invalid_credentials", async () => {
    const { login } = await import("../../src/services/auth-service.ts");
    const email = uniqueEmail("login-noexist");

    const result = await login({ prisma }, email, "whatever-password");

    expect(result).toEqual({ outcome: "invalid_credentials" });
  });

  it("login with an incorrect password returns invalid_credentials (same shape as the previous case)", async () => {
    const { register, login } = await import("../../src/services/auth-service.ts");
    const email = uniqueEmail("login-wrongpass");
    const registered = await register({ prisma }, email, "correct-password-123");
    if (registered.outcome === "created") createdUserIds.push(registered.userId);

    const result = await login({ prisma }, email, "wrong-password-999");

    expect(result).toEqual({ outcome: "invalid_credentials" });
  });

  it("increments the throttle on BOTH failure branches -- 5 combined failures across email-not-found and wrong-password reach the same blocked state", async () => {
    const { register, login } = await import("../../src/services/auth-service.ts");
    const loginThrottle = await import("../../src/lib/login-throttle.ts");
    const email = uniqueEmail("login-throttle-combined");

    expect(loginThrottle.isBlocked(email)).toBe(false);

    // 2 failures via the "email not found" branch -- the user does not exist yet.
    await login({ prisma }, email, "wrong-1");
    await login({ prisma }, email, "wrong-2");

    const registered = await register({ prisma }, email, "correct-password-123");
    if (registered.outcome === "created") createdUserIds.push(registered.userId);

    // 3 more failures via the "wrong password" branch, SAME email -> same throttle key, proving
    // both branches share one counter.
    await login({ prisma }, email, "wrong-3");
    await login({ prisma }, email, "wrong-4");
    await login({ prisma }, email, "wrong-5");

    expect(loginThrottle.isBlocked(email)).toBe(true);
  });

  it("returns outcome throttled WITHOUT touching userRepository/sessionRepository when already blocked", async () => {
    const { login } = await import("../../src/services/auth-service.ts");
    const loginThrottle = await import("../../src/lib/login-throttle.ts");
    const userRepository = await import("../../src/repositories/user-repository.ts");
    const sessionRepository = await import("../../src/repositories/session-repository.ts");
    const email = uniqueEmail("login-throttled-shortcircuit");

    for (let i = 0; i < 5; i += 1) {
      loginThrottle.recordFailure(email);
    }
    expect(loginThrottle.isBlocked(email)).toBe(true);

    const findByEmailSpy = vi.spyOn(userRepository, "findByEmail");
    const sessionCreateSpy = vi.spyOn(sessionRepository, "create");

    const result = await login({ prisma }, email, "irrelevant-password");

    expect(result).toEqual({ outcome: "throttled" });
    expect(findByEmailSpy).not.toHaveBeenCalled();
    expect(sessionCreateSpy).not.toHaveBeenCalled();
  });

  it("a successful login calls loginThrottle.reset", async () => {
    const { register, login } = await import("../../src/services/auth-service.ts");
    const loginThrottle = await import("../../src/lib/login-throttle.ts");
    const email = uniqueEmail("login-reset");
    const password = "correct-password-123";
    const registered = await register({ prisma }, email, password);
    if (registered.outcome === "created") createdUserIds.push(registered.userId);

    const resetSpy = vi.spyOn(loginThrottle, "reset");

    const result = await login({ prisma }, email, password);

    expect(result.outcome).toBe("success");
    expect(resetSpy).toHaveBeenCalledWith(email);
  });

  it("logout invalidates the session -- a subsequent findValid with the same token returns null", async () => {
    const { register, logout } = await import("../../src/services/auth-service.ts");
    const { findValid } = await import("../../src/repositories/session-repository.ts");
    const email = uniqueEmail("logout");
    const registered = await register({ prisma }, email, "correct-password-123");
    if (registered.outcome !== "created") {
      throw new Error("setup failed: register did not return outcome 'created'");
    }
    createdUserIds.push(registered.userId);

    expect(await findValid(prisma, registered.token)).toEqual({ userId: registered.userId });

    await logout({ prisma }, registered.token);

    expect(await findValid(prisma, registered.token)).toBeNull();
  });
});
