/**
 * Auth `preHandler` (spec-FEAT-004a Block 7 -- rewrite of spec-FEAT-002 Block 6's stub).
 *
 * Reads the session cookie (`SESSION_COOKIE_NAME`, exported by `app.ts`, Block 6) via
 * `request.cookies` and resolves it with `session-repository.findValid(request.server.prisma,
 * token)` -- called directly, never through a service, same precedent as the previous version
 * calling `user-repository.findById` directly (confirmed during PLAN's architecture audit). The
 * header this preHandler used to trust is no longer read anywhere in this file
 * (threat-FEAT-004a.md mitigation R5): it never authenticated anything real to begin with, and now
 * it authenticates nothing at all. If the cookie is absent OR the token does not resolve to a
 * valid, non-expired session, responds 401
 * with the SAME generic body `{ error: "unauthorized" }` in both cases -- no branch distinguishes
 * the reason (same principle the stub already applied). On success, decorates `request.userId` and
 * lets the chain continue (no explicit `done()` call needed -- Fastify only keeps running the chain
 * if this preHandler does not send a reply).
 */
import type { FastifyReply, FastifyRequest } from "fastify";
import { findValid } from "../repositories/session-repository.ts";
import { SESSION_COOKIE_NAME } from "../app.ts";

declare module "fastify" {
  interface FastifyRequest {
    userId?: string;
  }
}

const UNAUTHORIZED_BODY = { error: "unauthorized" } as const;

export async function authPreHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = request.cookies[SESSION_COOKIE_NAME];

  if (!token) {
    reply.code(401).send(UNAUTHORIZED_BODY);
    return;
  }

  const session = await findValid(request.server.prisma, token);

  if (!session) {
    reply.code(401).send(UNAUTHORIZED_BODY);
    return;
  }

  request.userId = session.userId;
}
