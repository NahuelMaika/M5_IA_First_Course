/**
 * Block 10 (spec-FEAT-004a) -- src/routes/auth.ts.
 *
 * Exercises `POST /auth/register`, `POST /auth/login` and `POST /auth/logout` end-to-end at the
 * HTTP layer via `fastify.inject`, with only `PrismaClient` faked (an in-memory `user`/`session`
 * store mirroring the shape `user-repository.ts`/`session-repository.ts` -- Block 2/Block 3 --
 * query against). `hashPassword`/`verifyPassword` (argon2) and `login-throttle`'s in-memory Map run
 * for real, same precedent as `routes/expenses.test.ts` (Block 10, spec-FEAT-002) faking only
 * Prisma. Each test uses a unique, random email so `login-throttle`'s module-level state (shared
 * across the whole file, never reset between tests) never bleeds from one test into another.
 */
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authPreHandler } from "../../src/plugins/auth.ts";
import { SESSION_COOKIE_NAME } from "../../src/app.ts";

// Only `userRepository.create` is overridden, and only in the P2002-race test below -- every other
// test in this file goes through the real implementation (wrapped, not replaced) against the fake
// Prisma client, same `importOriginal` pattern `routes/expenses.test.ts` uses for `@ggasia/domain`.
vi.mock("../../src/repositories/user-repository.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/repositories/user-repository.ts")>();
  return {
    ...actual,
    create: vi.fn(actual.create),
  };
});

interface FakeUser {
  id: string;
  email: string;
  passwordHash: string;
}

interface FakeSession {
  token: string;
  userId: string;
  expiresAt: Date;
}

function fakePrismaClient() {
  const users: FakeUser[] = [];
  const sessions: FakeSession[] = [];

  return {
    __state: { users, sessions },
    $connect: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string; email?: string } }) => {
        if (where.id) {
          return users.find((user) => user.id === where.id) ?? null;
        }
        if (where.email) {
          return users.find((user) => user.email === where.email) ?? null;
        }
        return null;
      }),
      create: vi.fn(
        async ({ data }: { data: { email: string; passwordHash: string } }) => {
          const created: FakeUser = {
            id: randomUUID(),
            email: data.email,
            passwordHash: data.passwordHash,
          };
          users.push(created);
          return created;
        },
      ),
    },
    session: {
      create: vi.fn(
        async ({
          data,
        }: {
          data: { userId: string; token: string; expiresAt: Date };
        }) => {
          const created: FakeSession = { ...data };
          sessions.push(created);
          return created;
        },
      ),
      findUnique: vi.fn(async ({ where: { token } }: { where: { token: string } }) => {
        return sessions.find((session) => session.token === token) ?? null;
      }),
      deleteMany: vi.fn(async ({ where: { token } }: { where: { token: string } }) => {
        const index = sessions.findIndex((session) => session.token === token);
        if (index >= 0) {
          sessions.splice(index, 1);
          return { count: 1 };
        }
        return { count: 0 };
      }),
    },
  };
}

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@ggasia.test`;
}

describe("POST /auth/register (Block 10, spec-FEAT-004a)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 201 and sets the session cookie for a new email", async () => {
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient();
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });

    const response = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: uniqueEmail("register-happy"), password: "supersecret1" },
    });

    expect(response.statusCode).toBe(201);
    expect(typeof response.json().userId).toBe("string");
    const sessionCookie = response.cookies.find((cookie) => cookie.name === SESSION_COOKIE_NAME);
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie?.value).toEqual(expect.any(String));

    await app.close();
  });

  it("returns 409 with no cookie when the email is already registered", async () => {
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient();
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });
    const email = uniqueEmail("register-duplicate");

    const first = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email, password: "supersecret1" },
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email, password: "anotherpass1" },
    });

    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({ error: "email_already_registered" });
    expect(second.cookies.some((cookie) => cookie.name === SESSION_COOKIE_NAME)).toBe(false);

    await app.close();
  });

  it("returns 400 when the password is shorter than 8 characters", async () => {
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient();
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });

    const response = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: uniqueEmail("register-short-pw"), password: "short1" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("validation_error");

    await app.close();
  });

  it("returns 500 (not 409) when userRepository.create throws P2002, simulating a findByEmail/create race", async () => {
    const { buildApp } = await import("../../src/app.ts");
    const userRepository = await import("../../src/repositories/user-repository.ts");
    const prisma = fakePrismaClient();
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });

    const p2002Error = Object.assign(new Error("Unique constraint failed on the fields: (`email`)"), {
      code: "P2002",
    });
    vi.mocked(userRepository.create).mockRejectedValueOnce(p2002Error);

    const response = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: uniqueEmail("register-race"), password: "supersecret1" },
    });

    expect(response.statusCode).toBe(500);
    expect(response.cookies.some((cookie) => cookie.name === SESSION_COOKIE_NAME)).toBe(false);

    await app.close();
  });
});

describe("POST /auth/login (Block 10, spec-FEAT-004a)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 and sets the session cookie for correct credentials", async () => {
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient();
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });
    const email = uniqueEmail("login-happy");
    const password = "supersecret1";

    const registerResponse = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email, password },
    });
    expect(registerResponse.statusCode).toBe(201);

    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().userId).toBe(registerResponse.json().userId);
    const sessionCookie = response.cookies.find((cookie) => cookie.name === SESSION_COOKIE_NAME);
    expect(sessionCookie).toBeDefined();

    await app.close();
  });

  it("returns 401 generic for wrong credentials", async () => {
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient();
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });
    const email = uniqueEmail("login-wrong");

    const registerResponse = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email, password: "supersecret1" },
    });
    expect(registerResponse.statusCode).toBe(201);

    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password: "totally-wrong-password" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "invalid_credentials" });
    expect(response.cookies.some((cookie) => cookie.name === SESSION_COOKIE_NAME)).toBe(false);

    await app.close();
  });

  it("returns 429 once the throttle blocks the email after repeated failures", async () => {
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient();
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });
    const email = uniqueEmail("login-throttle");

    const registerResponse = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email, password: "supersecret1" },
    });
    expect(registerResponse.statusCode).toBe(201);

    // FR-09: MAX_ATTEMPTS is 5 -- five failures arm the throttle, the sixth attempt is the one that
    // observes it already blocked.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failed = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email, password: "wrong-password" },
      });
      expect(failed.statusCode).toBe(401);
    }

    const throttled = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password: "wrong-password" },
    });

    expect(throttled.statusCode).toBe(429);
    expect(throttled.json()).toEqual({ error: "too_many_attempts" });

    await app.close();
  });
});

describe("POST /auth/logout (Block 10, spec-FEAT-004a)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 204, clears the cookie, and a later request with that cookie against a protected route gets 401", async () => {
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient();
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });
    // Ad-hoc protected probe route, same pattern `tests/app.test.ts` uses for cookie roundtrips --
    // this block's own route file (`auth.ts`) intentionally registers no `authPreHandler`-guarded
    // route, so the "logout actually invalidates the session" assertion needs one from elsewhere.
    app.get("/protected-probe", { preHandler: [authPreHandler] }, async () => ({ ok: true }));

    const email = uniqueEmail("logout-happy");
    const registerResponse = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email, password: "supersecret1" },
    });
    const sessionCookie = registerResponse.cookies.find(
      (cookie) => cookie.name === SESSION_COOKIE_NAME,
    );
    expect(sessionCookie).toBeDefined();

    const probeBeforeLogout = await app.inject({
      method: "GET",
      url: "/protected-probe",
      cookies: { [SESSION_COOKIE_NAME]: sessionCookie?.value ?? "" },
    });
    expect(probeBeforeLogout.statusCode).toBe(200);

    const logoutResponse = await app.inject({
      method: "POST",
      url: "/auth/logout",
      cookies: { [SESSION_COOKIE_NAME]: sessionCookie?.value ?? "" },
    });

    expect(logoutResponse.statusCode).toBe(204);
    expect(logoutResponse.body).toBe("");
    const clearedCookie = logoutResponse.cookies.find(
      (cookie) => cookie.name === SESSION_COOKIE_NAME,
    );
    expect(clearedCookie).toBeDefined();

    const probeAfterLogout = await app.inject({
      method: "GET",
      url: "/protected-probe",
      cookies: { [SESSION_COOKIE_NAME]: sessionCookie?.value ?? "" },
    });
    expect(probeAfterLogout.statusCode).toBe(401);

    await app.close();
  });

  it("returns 204 even without a cookie (idempotent)", async () => {
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient();
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });

    const response = await app.inject({ method: "POST", url: "/auth/logout" });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");

    await app.close();
  });
});

describe("session cookie attributes by NODE_ENV (Block 10, spec-FEAT-004a)", () => {
  const originalNodeEnv = process.env["NODE_ENV"];

  afterEach(() => {
    process.env["NODE_ENV"] = originalNodeEnv;
    vi.clearAllMocks();
  });

  it("sets Secure and SameSite=None in production; absent Secure and SameSite=Lax otherwise", async () => {
    const { buildApp } = await import("../../src/app.ts");

    process.env["NODE_ENV"] = "test";
    const devPrisma = fakePrismaClient();
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const devApp = buildApp({ prismaClient: devPrisma as never });
    const devResponse = await devApp.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: uniqueEmail("cookie-dev"), password: "supersecret1" },
    });
    const devCookie = devResponse.cookies.find((cookie) => cookie.name === SESSION_COOKIE_NAME);
    expect(devCookie).toBeDefined();
    expect(devCookie?.secure).toBeFalsy();
    expect(devCookie?.sameSite).toBe("Lax");
    await devApp.close();

    process.env["NODE_ENV"] = "production";
    const prodPrisma = fakePrismaClient();
    const prodApp = buildApp({
      // biome-ignore-next: fake client only exposes the methods the route/service exercise.
      prismaClient: prodPrisma as never,
      webOrigin: "https://ggasia.test",
    });
    const prodResponse = await prodApp.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: uniqueEmail("cookie-prod"), password: "supersecret1" },
    });
    const prodCookie = prodResponse.cookies.find((cookie) => cookie.name === SESSION_COOKIE_NAME);
    expect(prodCookie).toBeDefined();
    expect(prodCookie?.secure).toBe(true);
    expect(prodCookie?.sameSite).toBe("None");
    await prodApp.close();
  });
});
