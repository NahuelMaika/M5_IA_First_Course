/**
 * Category service (spec-FEAT-005a Block 5).
 *
 * Wraps `categoryRepository.findVisibleForUserWithId` (Block 3) with the same generic
 * `try/catch` -> `{outcome: "internal_error"}` contract as `expense-service.ts`: the real Prisma
 * error never leaves this module, only its server-side log entry does.
 */
import type { PrismaClient } from "../generated/prisma/client.ts";
import * as categoryRepository from "../repositories/category-repository.ts";
import type { VisibleCategoryWithId } from "../repositories/category-repository.ts";

/**
 * Same minimal logger shape as `ExpenseServiceDeps`'s -- deliberately not redefined against
 * Fastify's/Pino's full type, for the same reason documented there.
 */
export interface MinimalLogger {
  error: (obj: unknown, msg: string) => void;
}

/**
 * Smaller than `ExpenseServiceDeps`: this service never touches `@ggasia/categorization` or
 * `@ggasia/domain`, so it only needs `prisma` (+ the optional `logger`).
 */
export interface CategoryServiceDeps {
  prisma: PrismaClient;
  logger?: MinimalLogger;
}

export type ListCategoriesResult =
  | { outcome: "listed"; categories: VisibleCategoryWithId[] }
  | { outcome: "internal_error" };

/**
 * Lists the categories visible to `userId` (predefined + their own), `id` included -- consumed by
 * the `GET /categories` route (Block 6).
 */
export async function listCategories(
  deps: CategoryServiceDeps,
  userId: string,
): Promise<ListCategoriesResult> {
  try {
    const categories = await categoryRepository.findVisibleForUserWithId(deps.prisma, userId);
    return { outcome: "listed", categories };
  } catch (error) {
    // Same log hygiene as expense-service.ts's catch blocks: the real error, never leaked past
    // this module.
    deps.logger?.error({ err: error }, "category listing failed with an internal error");
    return { outcome: "internal_error" };
  }
}
