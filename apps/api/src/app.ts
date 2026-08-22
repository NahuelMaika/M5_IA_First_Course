/**
 * `apps/api` Fastify factory (spec-FEAT-002 Block 1).
 *
 * Kept minimal on purpose: this block only wires Fastify's own options
 * (notably `bodyLimit`, mitigation #1 in threat-FEAT-002.md) and returns the
 * instance without listening on a port, so it can be exercised with
 * `fastify.inject` in tests. Block 4 registers the Prisma plugin on top of
 * this factory; the `POST /expenses` route (Block 10) does the same -- this
 * block itself registers no route.
 */

import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import prismaPlugin from "./plugins/prisma.ts";
import { expensesRoutes } from "./routes/expenses.ts";
import type { PrismaClient } from "./generated/prisma/client.ts";

export interface BuildAppOptions {
  /**
   * Injected by tests (Block 4's Prisma plugin) so they can pass a client
   * pointed at DATABASE_URL_TEST instead of the real runtime singleton. When
   * omitted, the Prisma plugin instantiates its own client against
   * `env.DATABASE_URL`.
   */
  prismaClient?: PrismaClient;
  /**
   * The exact origin `@fastify/cors` authorizes (spec-FEAT-003b Block 2). `buildApp()` stays
   * synchronous -- returning a Promise here would force every one of the ~25 pre-existing call
   * sites across `tests/**` (none of which `await` it today, and none of which care about CORS)
   * to change, which is out of this block's declared scope. So unlike `plugins/prisma.ts`'s
   * `DATABASE_URL` handling, this can't dynamically `import("./env.ts")` when omitted -- that was
   * tried and breaks all of those callers synchronously reading `app.inject` off the return value.
   * Omitting it falls back to `DEFAULT_TEST_WEB_ORIGIN` below, which is guarded so it can only ever
   * apply outside a production `NODE_ENV` (see that constant) -- `src/server.ts`, the only
   * production caller, always passes `env.WEB_ORIGIN` explicitly regardless.
   */
  webOrigin?: string;
}

// Only reachable when `webOrigin` is omitted AND `NODE_ENV !== "production"` (guarded in
// `buildApp` below) -- exists solely for the ~25 pre-existing unit test callers that inject a fake
// `PrismaClient` and never touch CORS. A production run that somehow reached `buildApp()` without
// `webOrigin` throws instead of silently authorizing this origin (AGENTS.md: the API aborts rather
// than starting in a degraded state).
const DEFAULT_TEST_WEB_ORIGIN = "http://localhost:3000";

// The methods this API exposes today (`GET`, `POST`) plus the ones PRD-001's edit-expense ticket
// will add shortly (`PATCH`, `DELETE`) -- declared explicitly per AGENTS.md's own scar:
// `@fastify/cors` v11 defaults `methods` to `GET,HEAD,POST`, which silently breaks PATCH/DELETE
// and integration tests calling the app directly (bypassing CORS) never catch it.
const CORS_METHODS = ["GET", "POST", "PATCH", "DELETE"];

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  let webOrigin = options.webOrigin;
  if (!webOrigin) {
    if (process.env["NODE_ENV"] === "production") {
      throw new Error(
        "buildApp() was called in production without webOrigin -- refusing to fall back to " +
          `${DEFAULT_TEST_WEB_ORIGIN}. Pass env.WEB_ORIGIN explicitly (see src/server.ts).`,
      );
    }
    webOrigin = DEFAULT_TEST_WEB_ORIGIN;
  }

  const app = Fastify({
    // 16 KB -- generous over the real 500-character cap (RNF-07) enforced
    // later by parseExpense, but far below Fastify's 1 MB default.
    // threat-FEAT-002.md mitigation #1 (DoS via oversized body).
    bodyLimit: 16384,
  });

  app.register(prismaPlugin, { prismaClient: options.prismaClient });
  app.register(cors, {
    origin: webOrigin,
    methods: CORS_METHODS,
  });
  app.register(expensesRoutes);

  return app;
}
