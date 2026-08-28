/**
 * Block 4 (spec-FEAT-002) -- `src/plugins/prisma.ts`.
 *
 * Two groups of tests:
 *
 * 1. Decoration + lifecycle, using an injected fake `PrismaClient` (`options.prismaClient`).
 *    These do NOT need a real database connection -- they only assert that the plugin decorates
 *    `fastify.prisma` with whatever client it was given, and that it calls `$disconnect()` on
 *    `fastify.close()`. This is deliberate: it lets this suite run in an environment with no
 *    network route to the real database (see the integration group below).
 *
 * 2. A real integration test against `DATABASE_URL_TEST` (root `.env`), per this block's
 *    completion criterion. Same pattern as `tests/prisma-schema.test.ts` (Block 2) and
 *    `tests/seed.test.ts` (Block 3): loads the root `.env` explicitly with `dotenv`. In THIS
 *    environment there is no network route to the Supabase pooler, so this test is expected to
 *    fail with ECONNREFUSED/P1001 here -- documented, not hidden, same as Blocks 2 and 3.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { afterEach, describe, expect, it, vi } from "vitest";

const apiRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
config({ path: path.resolve(apiRoot, "../../.env") });

// Block 5 (spec-FEAT-006) makes `src/routes/expenses.ts` import `transcription-client.ts`
// statically, which imports `env.ts` eagerly -- a plain top-of-file `import { buildApp }` would
// resolve BEFORE the `config()` call above runs (ES module imports resolve ahead of a module's own
// top-level statements, regardless of source order), so `buildApp` is now imported dynamically,
// after `.env` is loaded.
const { buildApp } = await import("../../src/app.ts");

function fakePrismaClient() {
  return {
    $connect: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  };
}

describe("plugins/prisma.ts (Block 4, spec-FEAT-002)", () => {
  describe("with an injected fake PrismaClient (options.prismaClient)", () => {
    it("decorates fastify.prisma and it is accessible from a route", async () => {
      const fakeClient = fakePrismaClient();
      // biome-ignore-next: fake client only needs the methods the plugin uses.
      const app = buildApp({ prismaClient: fakeClient as never });

      app.get("/__test-prisma", async (request, reply) => {
        reply.send({ hasPrisma: Boolean(request.server.prisma) });
      });

      const response = await app.inject({ method: "GET", url: "/__test-prisma" });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ hasPrisma: true });
      expect(app.prisma).toBe(fakeClient);

      await app.close();
    }, 15000); // generous timeout: cold-importing the generated Prisma client (WASM query engine) is slow on the first test of the suite.

    it("disconnects the client when the server closes (no leaked connections between tests)", async () => {
      const fakeClient = fakePrismaClient();
      const app = buildApp({ prismaClient: fakeClient as never });

      await app.ready();
      expect(fakeClient.$disconnect).not.toHaveBeenCalled();

      await app.close();

      expect(fakeClient.$disconnect).toHaveBeenCalledTimes(1);
    });
  });

  describe("real integration against DATABASE_URL_TEST", () => {
    const TEST_DATABASE_URL = process.env["DATABASE_URL_TEST"];
    let app: ReturnType<typeof buildApp> | undefined;

    afterEach(async () => {
      if (app) {
        await app.close();
        app = undefined;
      }
    });

    it("runs a real query through fastify.prisma against DATABASE_URL_TEST", async () => {
      if (!TEST_DATABASE_URL) {
        throw new Error("DATABASE_URL_TEST must be set (root .env) to run this test.");
      }

      const { PrismaClient } = await import("../../src/generated/prisma/client.ts");
      const { PrismaPg } = await import("@prisma/adapter-pg");
      const adapter = new PrismaPg({ connectionString: TEST_DATABASE_URL });
      const testClient = new PrismaClient({ adapter });

      app = buildApp({ prismaClient: testClient });
      await app.ready();

      const result = await app.prisma.$queryRaw`SELECT 1 as ok`;

      expect(result).toEqual([{ ok: 1 }]);
    });
  });
});
