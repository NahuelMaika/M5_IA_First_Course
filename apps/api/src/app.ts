/**
 * `apps/api` Fastify factory (spec-FEAT-002 Block 1).
 *
 * Kept minimal on purpose: this block only wires Fastify's own options
 * (notably `bodyLimit`, mitigation #1 in threat-FEAT-002.md) and returns the
 * instance without listening on a port, so it can be exercised with
 * `fastify.inject` in tests. Future blocks (Prisma plugin: Block 4; the
 * `POST /expenses` route: Block 10) register themselves on top of this
 * factory -- this block registers no plugin and no route.
 */

import Fastify, { type FastifyInstance } from "fastify";

export interface BuildAppOptions {
  /**
   * Injected by later blocks (Block 4's Prisma plugin) so tests can pass a
   * client pointed at DATABASE_URL_TEST instead of a real singleton. Unused
   * in Block 1 -- accepted here only to keep the signature stable for the
   * blocks that build on top of this factory.
   */
  prismaClient?: unknown;
}

export function buildApp(_options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    // 16 KB -- generous over the real 500-character cap (RNF-07) enforced
    // later by parseExpense, but far below Fastify's 1 MB default.
    // threat-FEAT-002.md mitigation #1 (DoS via oversized body).
    bodyLimit: 16384,
  });

  return app;
}
