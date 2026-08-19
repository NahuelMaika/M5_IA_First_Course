/**
 * Block 6 (spec-FEAT-002) -- src/plugins/auth.ts.
 *
 * The `authPreHandler` is not registered on any real route yet (Block 10 does that). To test it in
 * isolation, this suite builds `buildApp()` with an injected FAKE `PrismaClient` (only
 * `user.findUnique` is mocked -- `userRepository.findById` calls exactly that) and registers a
 * minimal test-only route with `authPreHandler` as its `preHandler`, plus a downstream handler spy
 * to prove the chain is cut on every 401 path. No real network/database connection is used.
 */
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../../src/app.ts";
import { authPreHandler } from "../../src/plugins/auth.ts";

const TEST_USER_ID = "11111111-1111-1111-1111-111111111111";
const TEST_USER_EMAIL = "test@ggasia.test";

function fakePrismaClient() {
  return {
    $connect: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    user: {
      findUnique: vi.fn(async ({ where: { id } }: { where: { id: string } }) => {
        if (id === TEST_USER_ID) {
          return { id: TEST_USER_ID, email: TEST_USER_EMAIL };
        }
        return null;
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

describe("plugins/auth.ts (Block 6, spec-FEAT-002)", () => {
  it("responds 401 with the generic body when x-user-id is missing", async () => {
    const { app, downstreamHandler } = buildTestApp();

    const response = await app.inject({ method: "GET", url: "/__test-auth" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "unauthorized" });
    expect(downstreamHandler).not.toHaveBeenCalled();

    await app.close();
  });

  it("responds 401 with the SAME generic body when x-user-id belongs to no user", async () => {
    const { app, downstreamHandler } = buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/__test-auth",
      headers: { "x-user-id": "99999999-9999-9999-9999-999999999999" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "unauthorized" });
    expect(downstreamHandler).not.toHaveBeenCalled();

    await app.close();
  });

  it("passes through to the next handler with request.userId set when x-user-id resolves", async () => {
    const { app, downstreamHandler } = buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/__test-auth",
      headers: { "x-user-id": TEST_USER_ID },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ userId: TEST_USER_ID });
    expect(downstreamHandler).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it("never invokes downstream logic on either 401 path", async () => {
    const missingHeader = buildTestApp();
    await missingHeader.app.inject({ method: "GET", url: "/__test-auth" });
    expect(missingHeader.downstreamHandler).not.toHaveBeenCalled();
    await missingHeader.app.close();

    const unknownUser = buildTestApp();
    await unknownUser.app.inject({
      method: "GET",
      url: "/__test-auth",
      headers: { "x-user-id": "99999999-9999-9999-9999-999999999999" },
    });
    expect(unknownUser.downstreamHandler).not.toHaveBeenCalled();
    await unknownUser.app.close();
  });
});
