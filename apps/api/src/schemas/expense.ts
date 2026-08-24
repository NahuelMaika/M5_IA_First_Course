/**
 * Zod validation for the POST /expenses request body (spec-FEAT-002 Block 7).
 *
 * Only shape/emptiness is validated here. The 500-character cap (RNF-07) is
 * NOT duplicated in this schema -- it is already enforced by `parseExpense`
 * as Step 1 of its pipeline (`@ggasia/domain`); re-checking it here would
 * reimplement a rule that already lives in `packages/domain`.
 */

import { z } from "zod";

export const createExpenseBodySchema = z.object({
  input: z.string().min(1),
});

export type CreateExpenseBody = z.infer<typeof createExpenseBodySchema>;

/**
 * Zod validation for the GET /expenses request query (spec-FEAT-003a Block 4) -- the first query
 * param validated in the repo; everything else so far validates `body`.
 *
 * `limit` arrives as a querystring value, always a string (or absent). `z.coerce.number()` turns
 * that string into a number before `.int()` and the range check run, so a decimal like "1.5"
 * coerces to `1.5` and still fails `.int()` -- it is rejected, never silently truncated (FR-03: no
 * value gets adjusted in silence). A non-numeric string like "abc" coerces to `NaN`, which fails
 * every subsequent check. `.default(50)` only applies when the key is absent from the query object
 * entirely -- Zod's default only fires on `undefined`, so it never overrides an explicit invalid
 * value.
 */
export const listExpensesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;

/**
 * Zod validation for the PATCH /expenses/:id request body (spec-FEAT-005a Block 1).
 *
 * This body never goes through `parseExpense` -- that pipeline is exclusive to the free-text
 * creation flow (POST /expenses). Because of that, the RNF-07 (place length) and RNF-08 (amount
 * cap) limits from `PRD.md` are declared explicitly here instead of being inherited from
 * `@ggasia/domain`.
 *
 * The `when` future/retroactivity-floor rule mirrors `packages/domain/src/temporal.ts`'s
 * `resolveWhen`/`retroactivityFloor` exactly (RF-27/RF-28), reimplemented here in Zod because
 * `apps/web` does not depend on `@ggasia/domain` and this flow does not run through
 * `parseExpense` either.
 */

const MAX_AMOUNT = 999999999.99;

// `value * 100` rarely lands on an exact integer for a legitimate 2-decimal value (e.g.
// `19.99 * 100 === 1998.9999999999998`), so `Number.isInteger(value * 100)` alone would reject
// valid amounts -- and a fixed epsilon on that product doesn't fix it either, since the
// floating-point error scales with the value's magnitude (it reappears past ~1e8, well inside the
// RNF-08 cap). Counting decimal digits on the number's own string form sidesteps the multiplication
// entirely -- `toString()` produces the shortest string that round-trips back to the same double,
// which is exact for every value in this schema's range.
function hasAtMostTwoDecimals(value: number): boolean {
  const text = value.toString();
  if (text.includes("e") || text.includes("E")) return false;
  const decimalIndex = text.indexOf(".");
  if (decimalIndex === -1) return true;
  return text.length - decimalIndex - 1 <= 2;
}

function atMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// Same 12-closed-month window as `packages/domain/src/temporal.ts`'s `retroactivityFloor`: the
// first day of the month 12 months back from `referenceDate`'s month.
function retroactivityFloor(referenceDate: Date): Date {
  return new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 12, 1);
}

export const updateExpenseBodySchema = z
  .object({
    amount: z.coerce
      .number()
      .positive()
      .max(MAX_AMOUNT)
      .refine(hasAtMostTwoDecimals, { message: "amount must have at most 2 decimals" })
      .optional(),
    place: z.string().min(1).max(200).optional(),
    when: z.coerce
      .date()
      .refine(
        (value) => {
          const referenceDate = new Date();
          return atMidnight(value).getTime() <= atMidnight(referenceDate).getTime();
        },
        { message: "when cannot be in the future" },
      )
      .refine(
        (value) => {
          const referenceDate = new Date();
          return atMidnight(value).getTime() >= retroactivityFloor(referenceDate).getTime();
        },
        { message: "when is before the retroactivity floor" },
      )
      .optional(),
    categoryId: z.string().uuid().optional(),
    // No `.min(1)`: unlike `place`, an empty Descripción is a valid value (optional field of
    // kb.md's Modelo de Datos: Gasto) -- the PATCH must be able to clear it explicitly.
    description: z.string().max(300).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "at least one field must be provided",
  });

export type UpdateExpenseBody = z.infer<typeof updateExpenseBodySchema>;

/** Validates the `:id` route param on PATCH/DELETE /expenses/:id (spec-FEAT-005a Block 6). */
export const expenseIdParamsSchema = z.object({ id: z.string().uuid() });

export type ExpenseIdParams = z.infer<typeof expenseIdParamsSchema>;
