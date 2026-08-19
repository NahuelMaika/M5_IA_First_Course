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
