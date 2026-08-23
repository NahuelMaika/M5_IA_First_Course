/**
 * Block 2 (spec-FEAT-003b) -- CORS in `apps/api`.
 *
 * `apps/api` had no CORS configuration at all before this block: no browser running `apps/web`
 * (different origin per PRD.md -> "Riesgos y Dependencias") could call any endpoint. This suite
 * proves `@fastify/cors` is registered globally (Access-Control-Allow-Origin on a normal GET),
 * declares its methods explicitly (AGENTS.md scar: `@fastify/cors` v11 defaults to
 * `GET,HEAD,POST` and silently breaks PATCH/DELETE), and that its preflight `OPTIONS` route never
 * goes through `authPreHandler` (registered per-route, not globally -- confirmed by reading
 * `src/routes/expenses.ts`).
 *
 * The happy-path tests inject `webOrigin` directly into `buildApp()` instead of relying on
 * `env.ts` (see `src/app.ts`'s `BuildAppOptions.webOrigin` comment) -- this keeps them isolated
 * from `DATABASE_URL`/`APP_TIMEZONE`/`API_PORT`/`WEB_ORIGIN`, same as every other pre-existing
 * unit test in this suite (`tests/app.test.ts`, `tests/plugins/auth.test.ts`) that injects a fake
 * `PrismaClient` instead of a real `DATABASE_URL`. Only the sad-path test below exercises `env.ts`
 * directly, same pattern as `tests/env.test.ts`'s own `DATABASE_URL` sad path.
 *
 * Block 11 (spec-FEAT-004a) migrated the authenticated `GET /expenses` test below from the dead
 * `x-user-id` header to a real session cookie: the fake Prisma client now mocks `session.findUnique`
 * (what `authPreHandler`'s `findValid` actually calls, Block 7) instead of `user.findUnique`, same
 * pattern as `tests/plugins/auth.test.ts`'s own fake client.
 */
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE_NAME } from "../src/app.ts";

const TEST_USER_ID = "22222222-2222-2222-2222-222222222222";
const VALID_SESSION_TOKEN = "valid-raw-session-token-for-cors-tests";
// Deliberately NOT localhost, so a passing assertion proves the header came from configuration
// (`webOrigin`), not from `buildApp()`'s internal fallback for callers that don't care about CORS.
const TEST_WEB_ORIGIN = "https://app.ggasia.test";

vi.mock("../src/services/expense-service.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/services/expense-service.ts")>();
  return {
    ...actual,
    listExpenses: vi.fn(),
  };
});

// Same hashing algorithm as `session-repository.ts` (SHA-256 hex digest, threat-FEAT-004a.md R2) --
// duplicated here rather than imported, same pattern as `tests/plugins/auth.test.ts`, since the
// fake session row has to be keyed by what `findValid` actually looks up.
function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

const FAKE_SESSIONS = [
  {
    token: hashToken(VALID_SESSION_TOKEN),
    userId: TEST_USER_ID,
    expiresAt: new Date(Date.now() + 60_000),
  },
];

function fakePrismaClient() {
  return {
    $connect: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    session: {
      findUnique: vi.fn(async ({ where: { token } }: { where: { token: string } }) => {
        return FAKE_SESSIONS.find((session) => session.token === token) ?? null;
      }),
    },
  };
}

describe("CORS (Block 2, spec-FEAT-003b)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("GET /expenses includes Access-Control-Allow-Origin with the configured WEB_ORIGIN", async () => {
    const { listExpenses } = await import("../src/services/expense-service.ts");
    const { buildApp } = await import("../src/app.ts");
    vi.mocked(listExpenses).mockResolvedValue({ outcome: "listed", expenses: [] });

    // biome-ignore-next: fake client only exposes the methods authPreHandler exercises.
    const app = buildApp({ prismaClient: fakePrismaClient() as never, webOrigin: TEST_WEB_ORIGIN });

    const response = await app.inject({
      method: "GET",
      url: "/expenses",
      headers: { origin: TEST_WEB_ORIGIN },
      cookies: { [SESSION_COOKIE_NAME]: VALID_SESSION_TOKEN },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe(TEST_WEB_ORIGIN);

    await app.close();
  });

  it("GET /expenses includes Access-Control-Allow-Credentials: true (Block 1, spec-FEAT-004b)", async () => {
    const { listExpenses } = await import("../src/services/expense-service.ts");
    const { buildApp } = await import("../src/app.ts");
    vi.mocked(listExpenses).mockResolvedValue({ outcome: "listed", expenses: [] });

    // biome-ignore-next: fake client only exposes the methods authPreHandler exercises.
    const app = buildApp({ prismaClient: fakePrismaClient() as never, webOrigin: TEST_WEB_ORIGIN });

    const response = await app.inject({
      method: "GET",
      url: "/expenses",
      headers: { origin: TEST_WEB_ORIGIN },
      cookies: { [SESSION_COOKIE_NAME]: VALID_SESSION_TOKEN },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");

    await app.close();
  });

  it("preflight OPTIONS /expenses declares GET and POST explicitly in Access-Control-Allow-Methods, not Fastify's GET,HEAD,POST default", async () => {
    const { buildApp } = await import("../src/app.ts");
    // biome-ignore-next: fake client only exposes the methods the Prisma plugin calls.
    const app = buildApp({ prismaClient: fakePrismaClient() as never, webOrigin: TEST_WEB_ORIGIN });

    const response = await app.inject({
      method: "OPTIONS",
      url: "/expenses",
      headers: {
        origin: TEST_WEB_ORIGIN,
        "access-control-request-method": "POST",
      },
    });

    const allowedMethodsHeader = response.headers["access-control-allow-methods"];
    expect(allowedMethodsHeader).toBeDefined();
    // Fastify/@fastify/cors's own default is the literal string "GET,HEAD,POST" -- asserting
    // inequality proves `methods` was declared explicitly (AGENTS.md scar), not left at default.
    expect(allowedMethodsHeader).not.toBe("GET,HEAD,POST");
    const allowedMethods = String(allowedMethodsHeader)
      .split(",")
      .map((method) => method.trim());
    expect(allowedMethods).toEqual(expect.arrayContaining(["GET", "POST"]));

    await app.close();
  });

  it("preflight OPTIONS /expenses responds without requiring x-user-id (never reaches authPreHandler)", async () => {
    const { buildApp } = await import("../src/app.ts");
    // biome-ignore-next: fake client only exposes the methods the Prisma plugin calls.
    const app = buildApp({ prismaClient: fakePrismaClient() as never, webOrigin: TEST_WEB_ORIGIN });

    const response = await app.inject({
      method: "OPTIONS",
      url: "/expenses",
      headers: {
        origin: TEST_WEB_ORIGIN,
        "access-control-request-method": "POST",
        // No x-user-id header on purpose: authPreHandler would reply 401 for POST/GET, but it is
        // registered per-route (src/routes/expenses.ts), never at the CORS plugin's own
        // `onRequest` hook/wildcard OPTIONS route, so a preflight must never hit it.
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.statusCode).not.toBe(401);

    await app.close();
  });

  it("throws instead of falling back to DEFAULT_TEST_WEB_ORIGIN when webOrigin is omitted under NODE_ENV=production", async () => {
    const originalNodeEnv = process.env["NODE_ENV"];
    process.env["NODE_ENV"] = "production";

    try {
      const { buildApp } = await import("../src/app.ts");
      expect(() => buildApp({ prismaClient: fakePrismaClient() as never })).toThrow(
        /webOrigin/,
      );
    } finally {
      if (originalNodeEnv === undefined) {
        delete process.env["NODE_ENV"];
      } else {
        process.env["NODE_ENV"] = originalNodeEnv;
      }
    }
  });
});

describe("env.ts -- WEB_ORIGIN (Block 2, spec-FEAT-003b)", () => {
  const REQUIRED_ENV = {
    DATABASE_URL: "postgresql://user:pass@localhost:5432/ggasia",
    APP_TIMEZONE: "America/Argentina/Buenos_Aires",
    API_PORT: "3001",
  };

  const originalEnv = { ...process.env };

  function resetProcessEnv(): void {
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  }

  beforeEach(() => {
    vi.resetModules();
    resetProcessEnv();
    process.env.DATABASE_URL = REQUIRED_ENV.DATABASE_URL;
    process.env.APP_TIMEZONE = REQUIRED_ENV.APP_TIMEZONE;
    process.env.API_PORT = REQUIRED_ENV.API_PORT;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetProcessEnv();
  });

  it("aborts the process at startup when WEB_ORIGIN is missing, a trailing slash, or carries a path", async () => {
    const invalidValues = [
      undefined, // missing entirely
      "https://app.ggasia.test/", // trailing slash
      "https://app.ggasia.test/some/path", // path
    ];

    for (const invalidValue of invalidValues) {
      vi.resetModules();
      if (invalidValue === undefined) {
        delete process.env.WEB_ORIGIN;
      } else {
        process.env.WEB_ORIGIN = invalidValue;
      }

      const exitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation(((_code?: number) => {
          throw new Error("process.exit called");
        }) as never);
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

      await expect(import("../src/env.ts")).rejects.toThrow("process.exit called");

      expect(exitSpy).toHaveBeenCalledWith(1);
      const loggedMessage = errorSpy.mock.calls.map((call) => String(call[0])).join(" ");
      expect(loggedMessage).toContain("WEB_ORIGIN");

      exitSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});
