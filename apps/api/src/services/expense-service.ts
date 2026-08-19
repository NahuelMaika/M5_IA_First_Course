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

type RejectionReason = RejectedExpense["reason"];

export interface ExpenseServiceDeps {
  prisma: PrismaClient;
}

export type ExpenseServiceResult =
  | { outcome: "created"; expense: Expense }
  | { outcome: "rejected"; reason: RejectionReason }
  | { outcome: "internal_error" };

/**
 * Resolves the `categoryId` an already-parsed expense must be persisted with.
 *
 * NOTE: `categoryRepository.findVisibleForUser` (Block 8) returns `VisibleCategory[]` --
 * `{ name, active }`, no `id` -- because that is exactly the shape `resolveCategoryName`
 * (Block 5/ADR-004) expects. For the "resolved" outcome, the resolved category name is looked up
 * back to its id via `categoryRepository.findByNameForUser`, keeping this function entirely on the
 * `routes -> service -> repository` layering (no direct Prisma access here).
 */
async function resolveCategoryId(
  prisma: PrismaClient,
  userId: string,
  parsed: ParsedExpense,
): Promise<string | null> {
  if (parsed.categoryOrigin === "automatica") {
    const predefined = await categoryRepository.findPredefinedByName(prisma, parsed.category);
    return predefined?.id ?? null;
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
    return match?.id ?? null;
  }

  const created = await categoryRepository.create(prisma, {
    name: parsed.category,
    nameNormalized: normalize(parsed.category),
    ownerId: userId,
  });
  return created.id;
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
    const categoryId = await resolveCategoryId(deps.prisma, userId, parsed);
    if (categoryId === null) {
      return { outcome: "internal_error" };
    }

    const expense = await expenseRepository.create(deps.prisma, {
      userId,
      amount: new Prisma.Decimal(parsed.amount.toFixed(2)),
      place: parsed.place,
      when: parsed.when,
      categoryId,
      categoryOrigin: parsed.categoryOrigin,
      description: parsed.description,
      name: parsed.name,
      type: parsed.type,
      currency: "ARS",
      rawInput,
      channel: "texto",
    });

    return { outcome: "created", expense };
  } catch {
    return { outcome: "internal_error" };
  }
}
