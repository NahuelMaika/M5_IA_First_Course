/**
 * Expense repository (spec-FEAT-002 Block 8).
 *
 * Receives `PrismaClient` as a parameter, never imports one as a singleton (NFR-04). Contains no
 * business logic: it only persists the row the service (Block 9) already assembled. `amount` is
 * always a Prisma `Decimal` (NFR-02) -- this repository never accepts or produces a `number`/
 * `Float` for money.
 */
import type { Expense, Prisma, PrismaClient } from "../generated/prisma/client.ts";

export interface CreateExpenseInput {
  userId: string;
  amount: Prisma.Decimal;
  place: string;
  when: Date;
  categoryId: string;
  categoryOrigin: Expense["categoryOrigin"];
  description: string;
  name: string;
  type: Expense["type"];
  currency: string;
  rawInput: string;
  channel: Expense["channel"];
}

export async function create(prisma: PrismaClient, data: CreateExpenseInput): Promise<Expense> {
  return prisma.expense.create({
    data: {
      userId: data.userId,
      amount: data.amount,
      place: data.place,
      when: data.when,
      categoryId: data.categoryId,
      categoryOrigin: data.categoryOrigin,
      description: data.description,
      name: data.name,
      type: data.type,
      currency: data.currency,
      rawInput: data.rawInput,
      channel: data.channel,
    },
  });
}

/**
 * An expense row with its `category` relation resolved (spec-FEAT-003a Block 2) -- the read path
 * uses an `include` to get the category name in the same query, unlike the POST path (which
 * already has it in memory when it writes).
 */
export type ExpenseWithCategory = Prisma.ExpenseGetPayload<{ include: { category: true } }>;

export interface FindManyForUserParams {
  userId: string;
  limit: number;
}

export async function findManyForUser(
  prisma: PrismaClient,
  { userId, limit }: FindManyForUserParams,
): Promise<ExpenseWithCategory[]> {
  return prisma.expense.findMany({
    where: { userId },
    orderBy: [{ when: "desc" }, { createdAt: "desc" }],
    take: limit,
    include: { category: true },
  });
}

export interface FindByIdForUserParams {
  id: string;
  userId: string;
}

/**
 * Looks up an expense by `id` scoped to `userId` in the SAME Prisma query (spec-FEAT-005a Block 2,
 * mitigation R1 of the threat model) -- never a `findUnique({ id })` followed by comparing `userId`
 * in JS. Returns `null` both when the expense does not exist and when it belongs to another user,
 * without distinguishing between the two cases.
 */
export async function findByIdForUser(
  prisma: PrismaClient,
  { id, userId }: FindByIdForUserParams,
): Promise<Expense | null> {
  return prisma.expense.findFirst({ where: { id, userId } });
}

/** The only fields a PATCH can touch (spec-FEAT-005a Block 1's `updateExpenseBodySchema`) --
 * narrower than `Prisma.ExpenseUpdateInput` on purpose, same pattern as `CreateExpenseInput`: this
 * repository takes plain scalar values, never Prisma's relation-write/scalar-operator shapes. */
export interface UpdateExpenseInput {
  amount?: Prisma.Decimal;
  place?: string;
  when?: Date;
  categoryId?: string;
}

/**
 * Updates an expense already verified to belong to the caller by the service layer (Block 4), via
 * `findByIdForUser` -- this repository does not re-verify ownership. A P2025 from Prisma (record
 * not found) shouldn't happen in practice for that reason, and is not caught here: it re-throws
 * as-is (same criterion as `category-repository.ts`'s `create` re-throwing P2002 -- this repository
 * does not silence Prisma errors).
 */
export async function update(
  prisma: PrismaClient,
  id: string,
  data: UpdateExpenseInput,
): Promise<ExpenseWithCategory> {
  return prisma.expense.update({ where: { id }, data, include: { category: true } });
}

/**
 * Physically deletes an expense (FR-05, RF-44 of PRD.md) already verified to belong to the caller
 * by the service layer (Block 4). Same P2025 criterion as `update`: not caught here, re-thrown
 * as-is.
 */
export async function remove(prisma: PrismaClient, id: string): Promise<Expense> {
  return prisma.expense.delete({ where: { id } });
}
