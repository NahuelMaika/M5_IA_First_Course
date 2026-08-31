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
import { Prisma } from "../generated/prisma/client.ts";
import { authPreHandler } from "../plugins/auth.ts";
import {
  createExpenseBodySchema,
  expenseIdParamsSchema,
  listExpensesQuerySchema,
  updateExpenseBodySchema,
} from "../schemas/expense.ts";
import type { UpdateExpenseBody } from "../schemas/expense.ts";
import { createExpense, deleteExpense, listExpenses, updateExpense } from "../services/expense-service.ts";
import type { UpdateExpensePatch } from "../services/expense-service.ts";
import { transcribeAudio } from "../services/transcription-client.ts";

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
 * `POST /expenses/audio` route (spec-FEAT-006 Block 5).
 *
 * Same `routes -> service -> repository` shape as `handleCreateExpense`, with two extra steps
 * ahead of it: reading the uploaded file off the multipart request (`@fastify/multipart`, Block 4)
 * and transcribing it (`transcribeAudio`, Block 3) into the `rawInput` string `createExpense`
 * (Block 2's `channel` parameter) already knows how to consume. Neither the raw audio `buffer` nor
 * the transcribed text is ever included in a response body -- every early-return branch below
 * sends a fixed, generic body (FR-03/AC-02).
 */
async function handleCreateExpenseFromAudio(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const data = await request.file();

  if (!data) {
    reply.code(400).send({ error: "validation_error" });
    return;
  }

  const userId = request.userId;

  if (!userId) {
    // Defensive only: see `handleCreateExpense`'s identical branch.
    reply.code(401).send({ error: "unauthorized" });
    return;
  }

  let buffer: Buffer;
  try {
    buffer = await data.toBuffer();
  } catch {
    // The route's own `bodyLimit` (25 MB, see `expensesRoutes` below) already rejects most
    // oversized requests before this handler even runs -- this `catch` only covers the residual
    // case of a chunked body without a reliable `Content-Length` (AC-04). No custom body: the
    // plugin/Fastify's own 413 response is enough, and never reflects the (partial) buffer back.
    reply.code(413).send();
    return;
  }

  const transcription = await transcribeAudio(buffer, data.filename, data.mimetype, { logger: request.log });

  if (transcription.outcome === "error") {
    reply.code(502).send({ error: "transcription_failed" });
    return;
  }

  if (transcription.text.trim() === "") {
    reply.code(422).send({ reason: "transcripcion_vacia" });
    return;
  }

  const result = await createExpense(
    { prisma: request.server.prisma, logger: request.log },
    userId,
    transcription.text,
    "audio",
  );

  if (result.outcome === "rejected") {
    reply.code(422).send({ reason: result.reason });
    return;
  }

  if (result.outcome === "internal_error") {
    // No route-local log here: same reasoning as `handleCreateExpense`'s 500 branch -- the service
    // already logs the real error (without `rawInput`) via the `logger` dep just passed above.
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

/**
 * Maps the Zod-validated `PATCH /expenses/:id` body (`UpdateExpenseBody`) to the shape
 * `expenseService.updateExpense` expects (`UpdateExpensePatch`, an alias of the repository's
 * `UpdateExpenseInput`). Only `amount` needs a real conversion -- the schema parses it as a
 * `number`, while the repository (and NFR-02) require a `Prisma.Decimal`, same precedent as
 * `handleCreateExpense`'s own `parsed.amount` handling in `expense-service.ts`. Every other field
 * carries over unchanged. Built key-by-key (never a blind `{...body}`) so an absent field is
 * genuinely absent from the patch, not present with an `undefined` value -- `updateExpense`'s
 * `patch.categoryId !== undefined` check (Block 4) and the repository's Prisma `data` object both
 * depend on that distinction.
 */
function toUpdatePatch(body: UpdateExpenseBody): UpdateExpensePatch {
  const patch: UpdateExpensePatch = {};
  if (body.amount !== undefined) {
    patch.amount = new Prisma.Decimal(body.amount.toFixed(2));
  }
  if (body.place !== undefined) {
    patch.place = body.place;
  }
  if (body.when !== undefined) {
    patch.when = body.when;
  }
  if (body.categoryId !== undefined) {
    patch.categoryId = body.categoryId;
  }
  if (body.description !== undefined) {
    patch.description = body.description;
  }
  return patch;
}

/**
 * `PATCH /expenses/:id` route (spec-FEAT-005a Block 6).
 *
 * Chains `authPreHandler` -> `:id` UUID validation -> Zod body validation against
 * `updateExpenseBodySchema` (Block 1) -> `expenseService.updateExpense` (Block 4) -> HTTP response
 * mapping. The 200 response reuses the same FR-13 shape as `handleCreateExpense`'s -- `category` is
 * the resolved name off the `category` relation `updateExpense`'s "updated" result already includes
 * (`ExpenseWithCategory`), never a second Prisma query.
 */
async function handleUpdateExpense(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const paramsResult = expenseIdParamsSchema.safeParse(request.params);

  if (!paramsResult.success) {
    reply.code(400).send({ error: "validation_error", details: paramsResult.error.issues });
    return;
  }

  const bodyResult = updateExpenseBodySchema.safeParse(request.body);

  if (!bodyResult.success) {
    reply.code(400).send({ error: "validation_error", details: bodyResult.error.issues });
    return;
  }

  const userId = request.userId;

  if (!userId) {
    // Defensive only: see `handleCreateExpense`'s identical branch.
    reply.code(401).send({ error: "unauthorized" });
    return;
  }

  const result = await updateExpense(
    { prisma: request.server.prisma, logger: request.log },
    userId,
    paramsResult.data.id,
    toUpdatePatch(bodyResult.data),
  );

  if (result.outcome === "not_found") {
    reply.code(404).send({ error: "not_found" });
    return;
  }

  if (result.outcome === "invalid_category") {
    reply.code(422).send({ error: "invalid_category" });
    return;
  }

  if (result.outcome === "internal_error") {
    // No route-local log here: same reasoning as `handleCreateExpense`'s 500 branch -- the service
    // already logged the real error via the `logger` dep just passed above.
    reply.code(500).send({ error: "internal_error" });
    return;
  }

  const { expense } = result;

  reply.code(200).send({
    amount: expense.amount.toFixed(2),
    place: expense.place,
    when: expense.when,
    category: expense.category.name,
    categoryOrigin: expense.categoryOrigin,
    description: expense.description,
    name: expense.name,
    type: expense.type,
    currency: expense.currency,
  });
}

/**
 * `DELETE /expenses/:id` route (spec-FEAT-005a Block 6). Chains `authPreHandler` -> `:id` UUID
 * validation -> `expenseService.deleteExpense` (Block 4) -> HTTP response mapping. Success replies
 * 204 with no body (FR-05/RF-44 -- physical delete).
 */
async function handleDeleteExpense(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const paramsResult = expenseIdParamsSchema.safeParse(request.params);

  if (!paramsResult.success) {
    reply.code(400).send({ error: "validation_error", details: paramsResult.error.issues });
    return;
  }

  const userId = request.userId;

  if (!userId) {
    // Defensive only: see `handleCreateExpense`'s identical branch.
    reply.code(401).send({ error: "unauthorized" });
    return;
  }

  const result = await deleteExpense(
    { prisma: request.server.prisma, logger: request.log },
    userId,
    paramsResult.data.id,
  );

  if (result.outcome === "not_found") {
    reply.code(404).send({ error: "not_found" });
    return;
  }

  if (result.outcome === "internal_error") {
    reply.code(500).send({ error: "internal_error" });
    return;
  }

  reply.code(204).send();
}

export async function expensesRoutes(app: FastifyInstance): Promise<void> {
  app.route({
    method: "POST",
    url: "/expenses",
    preHandler: [authPreHandler],
    handler: handleCreateExpense,
  });

  app.route({
    method: "POST",
    url: "/expenses/audio",
    preHandler: [authPreHandler],
    bodyLimit: 25 * 1024 * 1024,
    handler: handleCreateExpenseFromAudio,
  });

  app.route({
    method: "GET",
    url: "/expenses",
    preHandler: [authPreHandler],
    handler: handleListExpenses,
  });

  app.route({
    method: "PATCH",
    url: "/expenses/:id",
    preHandler: [authPreHandler],
    handler: handleUpdateExpense,
  });

  app.route({
    method: "DELETE",
    url: "/expenses/:id",
    preHandler: [authPreHandler],
    handler: handleDeleteExpense,
  });
}
