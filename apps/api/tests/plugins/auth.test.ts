/**
 * Block 7 (spec-FEAT-004a) -- src/plugins/auth.ts rewrite.
 *
 * `authPreHandler` no longer reads `x-user-id` at all (threat-FEAT-004a.md mitigation R5): it
 * reads the session cookie (`SESSION_COOKIE_NAME`, exported by `src/app.ts`, Block 6) and resolves
 * it via `session-repository.findValid` directly (same precedent as the previous version calling
 * `user-repository.findById` directly -- confirmed during PLAN's architecture audit). This suite
 * injects a FAKE `PrismaClient` (only `session.findUnique` is mocked -- `findValid` calls exactly
 * that) and registers a minimal test-only route with `authPreHandler` as its `preHandler`, plus a
 * downstream handler spy to prove the chain is cut on every 401 path. No real network/database
 * connection is used.
 */
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { describe, expect, it, vi } from "vitest";

// Block 5 (spec-FEAT-006) makes `src/routes/expenses.ts` import `transcription-client.ts`
// statically, which imports `env.ts` eagerly -- same ordering issue as
// `tests/routes/expenses.test.ts`, fixed the same way: load the root `.env` first, then import
// `app.ts` dynamically. `src/plugins/auth.ts` itself statically imports `SESSION_COOKIE_NAME` from
// `../app.ts`, so `authPreHandler` must be imported dynamically here too -- a static import of it
// would resolve `app.ts` (and therefore `env.ts`) before `config()` below ever runs.
const apiRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
config({ path: path.resolve(apiRoot, "../../.env") });

const { buildApp, SESSION_COOKIE_NAME } = await import("../../src/app.ts");
const { authPreHandler } = await import("../../src/plugins/auth.ts");

const TEST_USER_ID = "11111111-1111-1111-1111-111111111111";
const VALID_TOKEN = "valid-raw-session-token";
const EXPIRED_TOKEN = "expired-raw-session-token";
const UNKNOWN_TOKEN = "unknown-raw-session-token";

// Same hashing algorithm as `session-repository.ts` (SHA-256 hex digest, threat-FEAT-004a.md R2) --
// duplicated here rather than imported, same pattern as `session-repository.test.ts`, since the
// fake DB row has to be keyed by what `findValid` actually looks up.
function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

const FAKE_SESSIONS = [
  { token: hashToken(VALID_TOKEN), userId: TEST_USER_ID, expiresAt: new Date(Date.now() + 60_000) },
  { token: hashToken(EXPIRED_TOKEN), userId: TEST_USER_ID, expiresAt: new Date(Date.now() - 60_000) },
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

function buildTestApp() {
  const fakeClient = fakePrismaClient();
  // biome-ignore-next: fake client only needs the methods the auth preHandler exercises.
  const app = buildApp({ prismaClient: fakeClient as never });

  const downstreamHandler = vi.fn(async (request, reply) => {
    reply.code(200).send({ userId: request.userId });
  });

  app.route({
    method: "GET",
    url: "/__test-auth",
    preHandler: authPreHandler,
    handler: downstreamHandler,
  });

  return { app, downstreamHandler };
}

describe("plugins/auth.ts (Block 7, spec-FEAT-004a)", () => {
  it("responds 401 with the generic body when there is no session cookie", async () => {
    const { app, downstreamHandler } = buildTestApp();

    const response = await app.inject({ method: "GET", url: "/__test-auth" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "unauthorized" });
    expect(downstreamHandler).not.toHaveBeenCalled();

    await app.close();
  });

  it("responds 401 with the SAME generic body when the session cookie is invalid/inexistent", async () => {
    const { app, downstreamHandler } = buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/__test-auth",
      cookies: { [SESSION_COOKIE_NAME]: UNKNOWN_TOKEN },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "unauthorized" });
    expect(downstreamHandler).not.toHaveBeenCalled();

    await app.close();
  });

  it("responds 401 with the SAME generic body when the session cookie is expired", async () => {
    const { app, downstreamHandler } = buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/__test-auth",
      cookies: { [SESSION_COOKIE_NAME]: EXPIRED_TOKEN },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "unauthorized" });
    expect(downstreamHandler).not.toHaveBeenCalled();

    await app.close();
  });

  it("sets request.userId and lets the chain continue when the session cookie is valid", async () => {
    const { app, downstreamHandler } = buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/__test-auth",
      cookies: { [SESSION_COOKIE_NAME]: VALID_TOKEN },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ userId: TEST_USER_ID });
    expect(downstreamHandler).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it("responds 401 when only x-user-id is sent, without a session cookie (regression -- the header no longer authenticates anything)", async () => {
    const { app, downstreamHandler } = buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/__test-auth",
      headers: { "x-user-id": TEST_USER_ID },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "unauthorized" });
    expect(downstreamHandler).not.toHaveBeenCalled();

    await app.close();
  });
});
