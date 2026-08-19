/**
 * Prisma plugin (spec-FEAT-002 Block 4).
 *
 * Decorates `fastify.prisma` with a `PrismaClient`. If `buildApp()` was given
 * `options.prismaClient` (Block 1's `BuildAppOptions`), that client is used as-is -- this is what
 * lets tests inject a client pointed at `DATABASE_URL_TEST` instead of the real runtime one.
 *
 * When no client is injected, this plugin instantiates one itself using the `@prisma/adapter-pg`
 * driver adapter against `env.DATABASE_URL` -- the pooled connection string (NOT `DIRECT_URL`,
 * which `prisma.config.ts` reserves for Migrate/DDL, per that file's own comment). This mirrors
 * the exact instantiation pattern used by `tests/prisma-schema.test.ts` and `tests/seed.test.ts`
 * (Blocks 2/3): `new PrismaPg({ connectionString })` passed as the `adapter` option to
 * `PrismaClient`, Prisma 7's required way of connecting since `schema.prisma` no longer carries a
 * `url` itself.
 *
 * The plugin calls `client.$connect()` before decorating. Fastify defers plugin execution until
 * the instance becomes ready (`.ready()`, `.listen()`, `.inject()`), so a connection failure
 * surfaces as a rejection of that call -- consistent with NFR-03 ("no valid connection => no
 * requests attended"): the app never finishes booting into a state that could serve traffic.
 *
 * Registered with `fastify-plugin` (`fp`) so the decoration is NOT encapsulated to this plugin's
 * own scope -- routes registered anywhere else on the same Fastify instance (Block 10's
 * `POST /expenses`, plus its own tests) can read `fastify.prisma` directly, per AGENTS.md ("routes
 * read `fastify.prisma` instead of importing a Prisma singleton").
 *
 * `env.ts` is imported dynamically, ONLY in the branch that instantiates a default client (i.e.
 * when no `prismaClient` was injected). Block 1 designed `env.ts` to be parsed by `server.ts`
 * before `buildApp()` runs, not as a transitive dependency of `app.ts` itself; a static top-level
 * import here would force every caller of `buildApp()` -- including tests that always inject a
 * client -- to have `DATABASE_URL`/`APP_TIMEZONE`/`API_PORT` set, which is not true of this
 * plugin's own unit tests (they only need a fake client, no real env).
 */
import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

export interface PrismaPluginOptions {
  prismaClient?: PrismaClient;
}

const prismaPlugin: FastifyPluginAsync<PrismaPluginOptions> = async (fastify, options) => {
  let client = options.prismaClient;

  if (!client) {
    const { env } = await import("../env.ts");
    client = new PrismaClient({
      adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
    });
  }

  await client.$connect();

  fastify.decorate("prisma", client);

  fastify.addHook("onClose", async () => {
    await client.$disconnect();
  });
};

export default fp(prismaPlugin, { name: "prisma-plugin" });
