/**
 * Expense service (spec-FEAT-002 Block 9).
 *
 * Orchestrates `parseExpense` (from `@ggasia/domain`, compiled) with the category-resolution
 * repositories (Block 8) and persists the result. This is the trust boundary B2 that
 * `threat-FEAT-001b.md` left explicitly open ("su validación en origen es responsabilidad de la
 * capa API, fuera de ese ticket"): `referenceDate` is ALWAYS the server's own clock (`new Date()`),
 * NEVER read from `rawInput` or any request field -- Block 7's Zod schema doesn't even expose a
 * date field, so there is nothing to read from in the first place.
 *
 * Any error surfaced here is either a typed `RejectionReason` (the user's input was invalid, no DB
 * touched) or a generic `internal_error` -- no Prisma message/stack, and no raw category-marker
 * name, ever leaves this module (mitigation threat #3; precedent set by
 * `@ggasia/categorization`'s `category-name.ts`, which never reflects a rejected marker name back).
 */
import { createCategorizer, normalize, resolveCategoryName } from "@ggasia/categorization";
import { parseExpense } from "@ggasia/domain";
import type { ParsedExpense, RejectedExpense } from "@ggasia/domain";
import { Prisma } from "../generated/prisma/client.ts";
import type { Expense, PrismaClient } from "../generated/prisma/client.ts";
import * as categoryRepository from "../repositories/category-repository.ts";
import * as expenseRepository from "../repositories/expense-repository.ts";
import type { ExpenseWithCategory } from "../repositories/expense-repository.ts";

type RejectionReason = RejectedExpense["reason"];

/**
 * Minimal logger shape the service needs -- deliberately not Fastify's/Pino's full type, so this
 * module (which must stay outside `apps/api`'s HTTP concerns per `routes -> service ->
 * repository`) doesn't couple to Fastify just to log. The route passes `request.log`/`fastify.log`
 * as-is, since Pino's `error` method is structurally compatible with this shape.
 */
export interface MinimalLogger {
  error: (obj: unknown, msg: string) => void;
}

export interface ExpenseServiceDeps {
  prisma: PrismaClient;
  logger?: MinimalLogger;
}

/**
 * One expense row in the shape the listing endpoint (Block 4) serializes -- `category` is already
 * the resolved name (never `categoryId`), same precedent as `createExpense`'s `category: string`.
 * `amount` stays a `Prisma.Decimal` and `when` a `Date`: the string/ISO conversion is the route's
 * job (Block 4), not the service's, mirroring `createExpense`. Deliberately excludes `rawInput` --
 * the listing never echoes the user's free-text input back.
 */
export interface ExpenseListItem {
  id: string;
  amount: Prisma.Decimal;
  place: string;
  when: Date;
  category: string;
  categoryOrigin: Expense["categoryOrigin"];
  description: string;
  name: string;
  type: Expense["type"];
  currency: string;
}

/**
 * `createExpense`'s result union stays separate from `listExpenses`'s (below) rather than one
 * shared "god union" -- otherwise every caller of either function would need to handle branches
 * (`"rejected"` for a read, `"listed"` for a write) that can never actually happen for it, and
 * the existing `POST /expenses` route (Block 10, spec-FEAT-002) would stop narrowing correctly
 * the moment a new outcome variant is added here for an unrelated operation.
 */
export type ExpenseServiceResult =
  | { outcome: "created"; expense: Expense; category: string }
  | { outcome: "rejected"; reason: RejectionReason }
  | { outcome: "internal_error" };

export type ListExpensesResult =
  | { outcome: "listed"; expenses: ExpenseListItem[] }
  | { outcome: "internal_error" };

interface CategoryResolution {
  categoryId: string;
  categoryName: string;
}

/**
 * Resolves the `categoryId` AND the category's display name an already-parsed expense must be
 * persisted/reported with. The name is returned alongside the id because it is already in memory
 * at this point (`parsed.category`, or the name `resolveCategoryName` resolved) -- the route
 * (Block 10) needs `category: string` for its FR-13 response and must not query Prisma directly
 * for it (that would violate `routes -> service -> repository`).
 *
 * NOTE: `categoryRepository.findVisibleForUser` (Block 8) returns `VisibleCategory[]` --
 * `{ name, active }`, no `id` -- because that is exactly the shape `resolveCategoryName`
 * (Block 5/ADR-004) expects. For the "resolved" outcome, the resolved category name is looked up
 * back to its id via `categoryRepository.findByNameForUser`, keeping this function entirely on the
 * `routes -> service -> repository` layering (no direct Prisma access here).
 */
async function resolveCategory(
  prisma: PrismaClient,
  userId: string,
  parsed: ParsedExpense,
): Promise<CategoryResolution | null> {
  if (parsed.categoryOrigin === "automatica") {
    const predefined = await categoryRepository.findPredefinedByName(prisma, parsed.category);
    return predefined ? { categoryId: predefined.id, categoryName: predefined.name } : null;
  }

  const visible = await categoryRepository.findVisibleForUser(prisma, userId);
  const resolution = resolveCategoryName(parsed.category, visible);

  if (resolution.outcome === "rejected") {
    // Not expected to be reachable: `parseExpense` already rejects an invalid marker before this
    // point (empty/oversized marker never reaches here as a `ParsedExpense`). Treated as
    // `internal_error` per the spec's Block 9 Logic step 4.
    return null;
  }

  if (resolution.outcome === "resolved") {
    const match = await categoryRepository.findByNameForUser(prisma, userId, resolution.category);
    return match ? { categoryId: match.id, categoryName: match.name } : null;
  }

  const created = await categoryRepository.create(prisma, {
    name: parsed.category,
    nameNormalized: normalize(parsed.category),
    ownerId: userId,
  });
  return { categoryId: created.id, categoryName: created.name };
}

/**
 * Creates one expense for `userId` from `rawInput`. See module docblock for the trust-boundary and
 * error-handling contract.
 */
export async function createExpense(
  deps: ExpenseServiceDeps,
  userId: string,
  rawInput: string,
): Promise<ExpenseServiceResult> {
  const referenceDate = new Date();
  const parseResult = parseExpense(rawInput, referenceDate, createCategorizer());

  if (!parseResult.ok) {
    return { outcome: "rejected", reason: parseResult.rejection.reason };
  }

  const parsed = parseResult.expense;

  try {
    const resolution = await resolveCategory(deps.prisma, userId, parsed);
    if (resolution === null) {
      return { outcome: "internal_error" };
    }

    const expense = await expenseRepository.create(deps.prisma, {
      userId,
      amount: new Prisma.Decimal(parsed.amount.toFixed(2)),
      place: parsed.place,
      when: parsed.when,
      categoryId: resolution.categoryId,
      categoryOrigin: parsed.categoryOrigin,
      description: parsed.description,
      name: parsed.name,
      type: parsed.type,
      currency: "ARS",
      rawInput,
      channel: "texto",
    });

    return { outcome: "created", expense, category: resolution.categoryName };
  } catch (error) {
    // Logs the real error for diagnosability -- never `rawInput` (same precedent as the module
    // docblock's "no raw category-marker name, ever leaves this module"), since it carries the
    // user's free-text input.
    deps.logger?.error({ err: error }, "expense creation failed with an internal error");
    return { outcome: "internal_error" };
  }
}

function mapExpenseRow(row: ExpenseWithCategory): ExpenseListItem {
  return {
    id: row.id,
    amount: row.amount,
    place: row.place,
    when: row.when,
    category: row.category.name,
    categoryOrigin: row.categoryOrigin,
    description: row.description,
    name: row.name,
    type: row.type,
    currency: row.currency,
  };
}

/**
 * Lists `userId`'s expenses, most recent `when` first (ordering is `findManyForUser`'s
 * responsibility -- Block 2 -- this function never reorders what it gets back). `userId` and
 * `limit` are trusted as already validated by upper layers (auth + the route's Zod schema,
 * Block 4): no revalidation, no default, no clamp here -- see module docblock's rationale for why
 * duplicating a validated rule in two layers is worse than trusting the boundary once.
 */
export async function listExpenses(
  deps: ExpenseServiceDeps,
  userId: string,
  limit: number,
): Promise<ListExpensesResult> {
  try {
    const rows = await expenseRepository.findManyForUser(deps.prisma, { userId, limit });
    return { outcome: "listed", expenses: rows.map(mapExpenseRow) };
  } catch (error) {
    // Same log hygiene as `createExpense`'s catch block: the real error, never raw expense data.
    deps.logger?.error({ err: error }, "expense listing failed with an internal error");
    return { outcome: "internal_error" };
  }
}
