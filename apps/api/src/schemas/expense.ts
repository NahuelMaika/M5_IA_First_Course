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
