/**
 * `POST /auth/register`, `POST /auth/login`, `POST /auth/logout` routes (spec-FEAT-004a Block 10).
 *
 * Chains Zod body validation (`schemas/auth.ts`, Block 8) -> `auth-service` (Block 9) -> HTTP
 * response/cookie mapping, same `routes -> service -> repository` split as `routes/expenses.ts`.
 *
 * DEVIATION FROM THE SPEC'S LOGIC BLOCK: the spec text for this block shows each handler passing
 * `{ prisma: request.server.prisma, logger: request.log }` as `Deps` to `register`/`login`/
 * `logout`. That was corrected during Block 9's review -- `auth-service.ts`'s `Deps` interface is
 * `{ prisma: PrismaClient }` only (no `logger`: services never import Fastify, per AGENTS.md, and
 * the field was unused). This file follows the corrected signature, passing `{ prisma:
 * request.server.prisma }` only.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { SESSION_COOKIE_NAME, sessionCookieOptions } from "../app.ts";
import { loginBodySchema, registerBodySchema } from "../schemas/auth.ts";
import { login, logout, register } from "../services/auth-service.ts";

async function handleRegister(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const bodyResult = registerBodySchema.safeParse(request.body);

  if (!bodyResult.success) {
    reply.code(400).send({ error: "validation_error", details: bodyResult.error.issues });
    return;
  }

  const result = await register(
    { prisma: request.server.prisma },
    bodyResult.data.email,
    bodyResult.data.password,
  );

  if (result.outcome === "duplicate_email") {
    reply.code(409).send({ error: "email_already_registered" }); // FR-04
    return;
  }

  reply
    .setCookie(SESSION_COOKIE_NAME, result.token, {
      ...sessionCookieOptions(),
      expires: result.expiresAt,
    })
    .code(201)
    .send({ userId: result.userId });
}

async function handleLogin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const bodyResult = loginBodySchema.safeParse(request.body);

  if (!bodyResult.success) {
    reply.code(400).send({ error: "validation_error", details: bodyResult.error.issues });
    return;
  }

  const result = await login(
    { prisma: request.server.prisma },
    bodyResult.data.email,
    bodyResult.data.password,
  );

  if (result.outcome === "throttled") {
    reply.code(429).send({ error: "too_many_attempts" }); // FR-10 -- explicit, allowed
    return;
  }

  if (result.outcome === "invalid_credentials") {
    reply.code(401).send({ error: "invalid_credentials" }); // FR-08 -- generic
    return;
  }

  reply
    .setCookie(SESSION_COOKIE_NAME, result.token, {
      ...sessionCookieOptions(),
      expires: result.expiresAt,
    })
    .code(200)
    .send({ userId: result.userId });
}

async function handleLogout(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = request.cookies[SESSION_COOKIE_NAME];

  if (token) {
    await logout({ prisma: request.server.prisma }, token);
  }

  reply.clearCookie(SESSION_COOKIE_NAME, { path: "/" }).code(204).send();
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.route({ method: "POST", url: "/auth/register", handler: handleRegister });
  app.route({ method: "POST", url: "/auth/login", handler: handleLogin });
  app.route({ method: "POST", url: "/auth/logout", handler: handleLogout });
}
