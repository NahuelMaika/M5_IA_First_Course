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
