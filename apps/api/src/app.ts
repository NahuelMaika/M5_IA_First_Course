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

import Fastify, { type FastifyInstance } from "fastify";
import prismaPlugin from "./plugins/prisma.ts";
import type { PrismaClient } from "./generated/prisma/client.ts";

export interface BuildAppOptions {
  /**
   * Injected by tests (Block 4's Prisma plugin) so they can pass a client
   * pointed at DATABASE_URL_TEST instead of the real runtime singleton. When
   * omitted, the Prisma plugin instantiates its own client against
   * `env.DATABASE_URL`.
   */
  prismaClient?: PrismaClient;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    // 16 KB -- generous over the real 500-character cap (RNF-07) enforced
    // later by parseExpense, but far below Fastify's 1 MB default.
    // threat-FEAT-002.md mitigation #1 (DoS via oversized body).
    bodyLimit: 16384,
  });

  app.register(prismaPlugin, { prismaClient: options.prismaClient });

  return app;
}
