/**
 * Auth stub `preHandler` (spec-FEAT-002 Block 6).
 *
 * Not a plugin registered globally -- it is a plain Fastify `preHandler` function, exported for
 * `POST /expenses` (Block 10, not implemented yet) to register on its own route. This block only
 * creates and tests it in isolation.
 *
 * Reads the `x-user-id` header and resolves it via `userRepository.findById(prisma, id)`, using
 * `request.server.prisma` (decorated by Block 4's plugin) -- never a parameter passed in
 * separately. If the header is missing/empty OR the user does not exist, responds 401 with the
 * SAME generic body `{ error: "unauthorized" }` in both cases (threat-FEAT-002.md mitigation #3:
 * do not confirm/deny which ids are valid). On success, decorates `request.userId` with the
 * validated id and lets the chain continue (no explicit `done()` call needed -- Fastify only keeps
 * running the chain if this preHandler does not send a reply).
 */
import type { FastifyReply, FastifyRequest } from "fastify";
import { findById } from "../repositories/user-repository.ts";

declare module "fastify" {
  interface FastifyRequest {
    userId?: string;
  }
}

const UNAUTHORIZED_BODY = { error: "unauthorized" } as const;

export async function authPreHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = request.headers["x-user-id"];
  const userId = typeof header === "string" && header.length > 0 ? header : undefined;

  if (!userId) {
    reply.code(401).send(UNAUTHORIZED_BODY);
    return;
  }

  const user = await findById(request.server.prisma, userId);

  if (!user) {
    reply.code(401).send(UNAUTHORIZED_BODY);
    return;
  }

  request.userId = user.id;
}
