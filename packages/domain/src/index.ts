/**
 * Public API of `@ggasia/domain` (spec-FEAT-001b Block 9). Exports the
 * pipeline's single entry point plus the result/domain types a caller needs
 * to consume it -- every internal stage (Blocks 2-7) and helper type stays
 * private to this package.
 */

export { parseExpense } from "./parse-expense.ts";
export type { ParseResult, ParsedExpense, RejectedExpense } from "./types.ts";
