import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.ts";

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
});
