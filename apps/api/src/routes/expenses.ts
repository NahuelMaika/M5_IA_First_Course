/**
 * `POST /expenses` route (spec-FEAT-002 Block 10).
 *
 * Chains `authPreHandler` (Block 6) -> Zod body validation against `createExpenseBodySchema`
 * (Block 7) -> `expenseService.createExpense` (Block 9) -> HTTP response mapping. Follows
 * `routes -> service -> repository` (AGENTS.md): the route never touches Prisma for business
 * logic OR presentation mapping, only reads `request.server.prisma` to pass it as a dependency to
 * the service.
 *
 * The FR-13 response shape requires the category's name (`category: string`). The service (Block
 * 9) already has that name in memory when it resolves `categoryId` -- it returns both in its
 * `{ outcome: "created" }` result, so the route reads `result.category` directly instead of
 * issuing its own Prisma query.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { authPreHandler } from "../plugins/auth.ts";
import { createExpenseBodySchema, listExpensesQuerySchema } from "../schemas/expense.ts";
import { createExpense, listExpenses } from "../services/expense-service.ts";

async function handleCreateExpense(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const bodyResult = createExpenseBodySchema.safeParse(request.body);

  if (!bodyResult.success) {
    reply.code(400).send({ error: "validation_error", details: bodyResult.error.issues });
    return;
  }

  const userId = request.userId;

  if (!userId) {
    // Defensive only: `authPreHandler` always sets `request.userId` (or replies 401 itself) before
    // this handler runs, since it is registered as this route's own `preHandler`.
    reply.code(401).send({ error: "unauthorized" });
    return;
  }

  const result = await createExpense(
    { prisma: request.server.prisma, logger: request.log },
    userId,
    bodyResult.data.input,
  );

  if (result.outcome === "rejected") {
    reply.code(422).send({ reason: result.reason });
    return;
  }

  if (result.outcome === "internal_error") {
    // No route-local log here: the service already logs the real error (without `rawInput`) via
    // the `logger` dep just passed above -- a second, generic log at this layer would only
    // duplicate the entry without adding diagnostic value.
    reply.code(500).send({ error: "internal_error" });
    return;
  }

  const { expense, category } = result;

  reply.code(201).send({
    amount: expense.amount.toFixed(2),
    place: expense.place,
    when: expense.when,
    category,
    categoryOrigin: expense.categoryOrigin,
    description: expense.description,
    name: expense.name,
    type: expense.type,
    currency: expense.currency,
  });
}

/**
 * `GET /expenses` route (spec-FEAT-003a Block 4).
 *
 * Chains `authPreHandler` -> Zod query validation against `listExpensesQuerySchema` ->
 * `expenseService.listExpenses` -> HTTP response mapping, same order as the POST handler above.
 * `limit`'s coercion/default/range live entirely in the Zod schema; this handler passes the parsed
 * value through unchanged.
 */
async function handleListExpenses(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const queryResult = listExpensesQuerySchema.safeParse(request.query);

  if (!queryResult.success) {
    reply.code(400).send({ error: "validation_error", details: queryResult.error.issues });
    return;
  }

  const userId = request.userId;

  if (!userId) {
    // Defensive only: `authPreHandler` always sets `request.userId` (or replies 401 itself) before
    // this handler runs, since it is registered as this route's own `preHandler`.
    reply.code(401).send({ error: "unauthorized" });
    return;
  }

  const result = await listExpenses(
    { prisma: request.server.prisma, logger: request.log },
    userId,
    queryResult.data.limit,
  );

  if (result.outcome === "internal_error") {
    // No route-local log here: the service already logs the real error via the `logger` dep just
    // passed above -- same reasoning as `handleCreateExpense`'s 500 branch.
    reply.code(500).send({ error: "internal_error" });
    return;
  }

  reply.code(200).send({
    expenses: result.expenses.map((expense) => ({
      id: expense.id,
      amount: expense.amount.toFixed(2),
      place: expense.place,
      when: expense.when,
      category: expense.category,
      categoryOrigin: expense.categoryOrigin,
      description: expense.description,
      name: expense.name,
      type: expense.type,
      currency: expense.currency,
    })),
  });
}

export async function expensesRoutes(app: FastifyInstance): Promise<void> {
  app.route({
    method: "POST",
    url: "/expenses",
    preHandler: [authPreHandler],
    handler: handleCreateExpense,
  });

  app.route({
    method: "GET",
    url: "/expenses",
    preHandler: [authPreHandler],
    handler: handleListExpenses,
  });
}
