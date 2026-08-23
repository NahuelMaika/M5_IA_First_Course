/**
 * `GET /categories` route (spec-FEAT-005a Block 6).
 *
 * Chains `authPreHandler` -> `categoryService.listCategories` (Block 5) -> HTTP response mapping,
 * same `routes -> service -> repository` split as `routes/expenses.ts`. No request body or query
 * params to validate -- the only input is the session-resolved `userId`.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { authPreHandler } from "../plugins/auth.ts";
import { listCategories } from "../services/category-service.ts";

async function handleListCategories(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const userId = request.userId;

  if (!userId) {
    // Defensive only: `authPreHandler` always sets `request.userId` (or replies 401 itself) before
    // this handler runs, since it is registered as this route's own `preHandler`.
    reply.code(401).send({ error: "unauthorized" });
    return;
  }

  const result = await listCategories({ prisma: request.server.prisma, logger: request.log }, userId);

  if (result.outcome === "internal_error") {
    // No route-local log here: the service already logs the real error via the `logger` dep just
    // passed above -- same reasoning as `routes/expenses.ts`'s 500 branches.
    reply.code(500).send({ error: "internal_error" });
    return;
  }

  reply.code(200).send({
    categories: result.categories.map((category) => ({
      id: category.id,
      name: category.name,
      active: category.active,
    })),
  });
}

export async function categoriesRoutes(app: FastifyInstance): Promise<void> {
  app.route({
    method: "GET",
    url: "/categories",
    preHandler: [authPreHandler],
    handler: handleListCategories,
  });
}
