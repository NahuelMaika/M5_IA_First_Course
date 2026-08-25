/**
 * Block 6 (spec-FEAT-005a) -- src/routes/categories.ts.
 *
 * Same convention as `tests/routes/expenses.test.ts`'s `GET /expenses` describe: `listCategories`
 * (Block 5) already has its own dedicated test suite (tests/services/category-service.test.ts), so
 * it is mocked here to isolate auth wiring and HTTP response mapping without re-testing the
 * repository/visibility logic.
 */
import { createHash, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE_NAME } from "../../src/app.ts";

const TEST_TIMEOUT_MS = 60_000;

const TEST_USER_ID = "11111111-1111-1111-1111-111111111111";
const VALID_SESSION_TOKEN = "valid-raw-session-token-for-categories-route-tests";

// Same hashing algorithm as `session-repository.ts` (SHA-256 hex digest) -- duplicated here rather
// than imported, same pattern as `tests/routes/expenses.test.ts`'s own fake client.
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

// Only `session.findUnique` is faked -- `authPreHandler` is the only Prisma-touching code this
// route chain runs before reaching the (mocked) service.
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

vi.mock("../../src/services/category-service.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/category-service.ts")>();
  return {
    ...actual,
    listCategories: vi.fn(),
  };
});

describe("GET /categories (Block 6, spec-FEAT-005a)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with the serialized category list", async () => {
    const { listCategories } = await import("../../src/services/category-service.ts");
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient();
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });

    vi.mocked(listCategories).mockResolvedValue({
      outcome: "listed",
      categories: [
        { id: randomUUID(), name: "Comida", active: true },
        { id: randomUUID(), name: "Mi categoría", active: true },
      ],
    });

    const response = await app.inject({
      method: "GET",
      url: "/categories",
      cookies: { [SESSION_COOKIE_NAME]: VALID_SESSION_TOKEN },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.categories).toHaveLength(2);
    expect(body.categories[0]).toMatchObject({ name: "Comida", active: true });
    expect(listCategories).toHaveBeenCalledWith(expect.any(Object), TEST_USER_ID);

    await app.close();
  }, TEST_TIMEOUT_MS);

  it("returns 401 without invoking the service when there is no session cookie", async () => {
    const { listCategories } = await import("../../src/services/category-service.ts");
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient();
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });

    const response = await app.inject({ method: "GET", url: "/categories" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "unauthorized" });
    expect(listCategories).not.toHaveBeenCalled();

    await app.close();
  }, TEST_TIMEOUT_MS);

  it("returns 500 with a generic body when the service reports internal_error, without leaking it", async () => {
    const { listCategories } = await import("../../src/services/category-service.ts");
    const { buildApp } = await import("../../src/app.ts");
    const prisma = fakePrismaClient();
    // biome-ignore-next: fake client only exposes the methods the route/service exercise.
    const app = buildApp({ prismaClient: prisma as never });

    vi.mocked(listCategories).mockResolvedValue({ outcome: "internal_error" });

    const response = await app.inject({
      method: "GET",
      url: "/categories",
      cookies: { [SESSION_COOKIE_NAME]: VALID_SESSION_TOKEN },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: "internal_error" });

    await app.close();
  }, TEST_TIMEOUT_MS);
});
