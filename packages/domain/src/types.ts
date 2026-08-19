/**
 * Domain types for the expense extraction pipeline (kb.md "Modelo de Datos:
 * Gasto"). Pure data shapes only -- no pipeline logic lives here (Block 1 of
 * spec-FEAT-001b is scaffolding, not implementation).
 */

/** Origin of the assigned category (kb.md "Categoría", FR-10, AC-17). */
export type CategoryOrigin = "automatica" | "marcador";

/**
 * A fully interpreted expense (kb.md "Modelo de Datos: Gasto"). Produced only
 * when every stage of the pipeline succeeds -- there is no partial or
 * ambiguous intermediate state (PRD Goal 2).
 */
export interface ParsedExpense {
  /** Monto -- amount spent, always registered with exactly 2 decimals (FR-06). */
  amount: number;
  /** Lugar -- where the money was spent; the categorizer's sole input (FR-07). */
  place: string;
  /** Cuando -- date of the expense (FR-02, FR-03). */
  when: Date;
  /** Categoría -- category name assigned to this expense (FR-10). */
  category: string;
  /** Origin of `category`: automatic keyword match, or an explicit `#marker`. */
  categoryOrigin: CategoryOrigin;
  /** Descripción -- literal free-text comment, right of the ` - ` separator (FR-01). */
  description: string;
  /** Nombre -- user-facing identifier, defaulted per kb.md when not given (FR-08). */
  name: string;
  /** Tipo -- defaults to "Personal" when not specified (FR-09); no other value exists yet. */
  type: "Personal";
}

/**
 * One distinct reason for rejecting an input, one literal per rejection rule
 * in kb.md/FR-11:
 * - `empty_left_segment`: FR-01 -- nothing left of the ` - ` separator.
 * - `amount_indeterminate`: FR-06/FR-11 -- no number found, or several
 *   numbers with no single one marked `$`.
 * - `amount_malformed`: FR-06/FR-11 -- malformed thousands/decimal
 *   separators, or more than 2 decimals.
 * - `amount_zero`: FR-14 -- the resolved Monto is exactly 0. A negative
 *   amount is inexpressible from free text (kb.md: `-` never survives as
 *   part of a number), so zero is the only non-positive value reachable
 *   through this path.
 * - `empty_place`: FR-07/FR-11 -- Lugar empty after filler-word discard.
 * - `future_date`: FR-02/FR-11 -- resolved date is after `referenceDate`.
 * - `date_out_of_window`: FR-02/FR-11 -- resolved date predates the
 *   12-closed-month retroactivity floor.
 * - `length_exceeded`: FR-12/NFR-04 -- raw input, Lugar, Descripción or
 *   Nombre over its cap (see `limits.ts`).
 *
 * Deliberately code-only: never carries the raw input text (LOW risk in
 * threat-FEAT-001b.md), following the precedent set by
 * `packages/categorization/src/category-name.ts`'s `CategoryNameResolution`,
 * which never reflects user input back in a rejection either.
 */
export type RejectionReason =
  | "empty_left_segment"
  | "amount_indeterminate"
  | "amount_malformed"
  | "amount_zero"
  | "empty_place"
  | "future_date"
  | "date_out_of_window"
  | "length_exceeded";

/**
 * A rejected input (kb.md, FR-11). Discriminated by `reason` only -- never by
 * inspecting free-form text. See `RejectionReason` for why the raw input is
 * never included here.
 */
export interface RejectedExpense {
  reason: RejectionReason;
}

/**
 * Outcome of interpreting one raw input (Block 8's `parseExpense`).
 * Discriminated by `ok`: there is no intermediate/ambiguous state
 * (PRD Goal 2).
 */
export type ParseResult =
  | { ok: true; expense: ParsedExpense }
  | { ok: false; rejection: RejectedExpense };

/**
 * The date the pipeline treats as "today" (FR-03) -- injected by the caller,
 * never read from the system clock (kb.md "Cuando").
 *
 * TRUSTED PRECONDITION (threat-FEAT-001b.md, trust boundary B2, risk
 * MEDIUM): this package does NOT validate `referenceDate`'s origin or
 * plausibility -- it is received already valid. Validating where it comes
 * from (e.g. that it is not manipulated client input) is the responsibility
 * of whoever invokes the pipeline -- the future API layer, out of scope for
 * this ticket.
 */
export type ReferenceDate = Date;
