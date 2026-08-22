import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { buildApp, sessionCookieOptions } from "../src/app.ts";

// Fake PrismaClient injected via `options.prismaClient` so `buildApp()` does not trigger the
// plugin's real-connection branch, which dynamically imports `env.ts` and would abort the
// process via `process.exit(1)` when the root `.env` was not loaded (this test is a pure unit
// test and must not depend on it). Same pattern as `tests/plugins/prisma.test.ts` (Block 4).
function fakePrismaClient() {
  return {
    $connect: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  };
}

describe("buildApp", () => {
  it("builds an app that can be exercised via inject, without listening on a real port", async () => {
    // biome-ignore-next: fake client only needs the methods the plugin uses.
    const app = buildApp({ prismaClient: fakePrismaClient() as never });

    const response = await app.inject({ method: "GET", url: "/route-that-does-not-exist" });

    expect(response.statusCode).toBe(404);

    await app.close();
  });

  it("registers the cookie plugin, so a route can read/write cookies", async () => {
    // biome-ignore-next: fake client only needs the methods the plugin uses.
    const app = buildApp({ prismaClient: fakePrismaClient() as never });

    // Ad-hoc route only used to prove `reply.setCookie`/`request.cookies` exist -- both are
    // decorated by `@fastify/cookie`, absent from a plain Fastify instance.
    app.get("/cookie-roundtrip", (request, reply) => {
      reply.setCookie("probe", "value");
      return { echoed: request.cookies["probe"] ?? null };
    });

    const setResponse = await app.inject({ method: "GET", url: "/cookie-roundtrip" });
    expect(setResponse.cookies.some((cookie) => cookie.name === "probe")).toBe(true);

    const readResponse = await app.inject({
      method: "GET",
      url: "/cookie-roundtrip",
      cookies: { probe: "value" },
    });
    expect(readResponse.json()).toEqual({ echoed: "value" });

    await app.close();
  });
});

describe("sessionCookieOptions", () => {
  const originalNodeEnv = process.env["NODE_ENV"];

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env["NODE_ENV"] = originalNodeEnv;
  });

  it("returns secure: true and sameSite: 'none' when NODE_ENV is 'production'", () => {
    process.env["NODE_ENV"] = "production";

    expect(sessionCookieOptions()).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: "/",
    });
  });

  it("returns secure: false and sameSite: 'lax' when NODE_ENV is not 'production'", () => {
    process.env["NODE_ENV"] = "test";

    expect(sessionCookieOptions()).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
    });
  });
});
