/**
 * Determines the Monto (amount) of an expense from the tokens left after the
 * temporal reference, category marker and word-form numerals have already
 * been extracted (kb.md "Extracción de Campos desde Texto Libre" -> "Monto",
 * FR-06, NFR-05).
 *
 * Tie-break table over the number tokens still present (kb.md lines
 * 124-134):
 * - None -> rejection.
 * - Exactly one -> that is the Monto, `$`-marked or not.
 * - Several, exactly one marked with `$` -> the marked one wins
 *   (`"2 cafés $3000"` -> 3000).
 * - Several, none marked, or more than one marked -> rejection. The system
 *   never picks by position or size: a silently guessed amount is worse
 *   than asking the user to re-enter it.
 *
 * A number is a token made up only of digits and, optionally, `.`/`,`
 * between them (kb.md "Definición de número") -- `$` may prefix it, either
 * glued to the digit run (`$3000`, one token) or as its own preceding token
 * (`$`, `3000`). A trailing `$` (`3000$`) never marks the number it
 * follows -- the mark only look forward, per kb.md's `$` table.
 *
 * Interpreted with es-AR convention (`.` thousands, `,` decimals). A dot is
 * optional formatting: a plain digit run with no dot at all is valid at any
 * length (`1500`), but once a dot is used, every group it creates must be
 * exactly 3 digits except the leading one (1-3 digits) -- `1.5` and `1.50`
 * are incomplete groups and are rejected rather than guessed as 1500 or 1,5
 * (kb.md "Formas malformadas"). A decimal part, when present, must be
 * exactly 2 digits -- more or fewer is rejected outright, never truncated
 * nor rounded (NFR-05 threat mitigation). The accepted range tops out at
 * 999.999.999,99, the same cap as word-form numerals (Block 5).
 *
 * A resolved Monto that is exactly 0 is rejected (FR-14): a negative amount
 * is inexpressible from free text (the `-` never survives as part of a
 * number, kb.md), so zero is the only non-positive value reachable through
 * this path. This check runs only after the winning candidate has already
 * parsed as well-formed -- it is distinct from `amount_malformed` (a shape
 * problem) and from `amount_indeterminate` (no usable candidate at all).
 *
 * On success, the result also reports the `consumedTokens` span -- the
 * range, over the input `tokens` array, that produced the winning Monto
 * candidate (the number token, plus its preceding `$` token when the mark
 * was space-separated). Callers that need to know which tokens formed the
 * Monto (e.g. to exclude them when computing Lugar) consume this span
 * instead of re-deriving it.
 */

import type { RejectedExpense } from "./types.ts";

/** The three Monto-specific rejection reasons this stage can produce. */
export type AmountRejectionReason = Extract<
  RejectedExpense["reason"],
  "amount_indeterminate" | "amount_malformed" | "amount_zero"
>;

/** A half-open range of token indices (`end` exclusive), over the tokens array a caller passed in. */
export interface TokenSpan {
  start: number;
  end: number; // exclusive
}

export type AmountResult =
  | { amount: number; consumedTokens: TokenSpan }
  | { rejection: AmountRejectionReason };

const MAX_AMOUNT = 999_999_999.99;

// A "number" per kb.md's formal definition: digits, optionally separated by
// `.`/`,` between digits. Loose on purpose -- it only decides whether a
// token is a number CANDIDATE at all; well-formedness (grouping, decimal
// digit count) is checked separately, only for the token that wins the
// tie-break, so a malformed loser among several ambiguous numbers still
// reports "indeterminate", not "malformed".
const NUMBER_TOKEN_PATTERN = /^\d+(?:[.,]\d+)*$/;

// Well-formed es-AR amount: either a plain digit run (no dot at all, any
// length), or a dot-grouped integer with a 1-3 digit leading group and
// exactly-3-digit trailing groups, each optionally followed by a comma and
// exactly 2 decimal digits.
const WELL_FORMED_AMOUNT_PATTERN = /^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{2})?$/;

interface NumberCandidate {
  /** The digit-and-separator portion, with any leading `$` stripped. */
  raw: string;
  marked: boolean;
  /** The token span (over the caller's `tokens` array) this candidate consumed. */
  span: TokenSpan;
}

function isNumberToken(token: string): boolean {
  return NUMBER_TOKEN_PATTERN.test(token);
}

/**
 * Walks `tokens` collecting every number candidate, resolving `$` marking
 * per kb.md's table: a `$` glued to a digit run marks it; a standalone `$`
 * marks the very next token when that token is itself a plain number (and
 * both tokens are consumed together); a standalone `$` with no number after
 * it, or a `$` following a number (`3000$`), has no effect.
 */
function collectNumberCandidates(tokens: string[]): NumberCandidate[] {
  const candidates: NumberCandidate[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;

    if (token.startsWith("$") && token.length > 1 && isNumberToken(token.slice(1))) {
      candidates.push({ raw: token.slice(1), marked: true, span: { start: index, end: index + 1 } });
      continue;
    }

    if (token === "$") {
      const next = tokens[index + 1];
      if (next !== undefined && isNumberToken(next)) {
        candidates.push({ raw: next, marked: true, span: { start: index, end: index + 2 } });
        index += 1; // the marked number was consumed along with its '$'
      }
      continue;
    }

    if (isNumberToken(token)) {
      candidates.push({ raw: token, marked: false, span: { start: index, end: index + 1 } });
    }
  }

  return candidates;
}

/**
 * Parses a number candidate's raw digit/separator string into its numeric
 * value, only if it is well-formed and within the cap. Returns `null` for
 * any malformed shape (incomplete thousands group, wrong decimal digit
 * count) or a value over 999.999.999,99 -- callers turn that into
 * `amount_malformed`, never a guessed reading.
 */
function parseWellFormedAmount(raw: string): number | null {
  if (!WELL_FORMED_AMOUNT_PATTERN.test(raw)) return null;

  const [integerPart, decimalPart] = raw.split(",");
  const digitsOnlyInteger = integerPart!.replace(/\./g, "");
  const value = Number(`${digitsOnlyInteger}.${decimalPart ?? "00"}`);

  if (value > MAX_AMOUNT) return null;

  return value;
}

export function determineAmount(tokens: string[]): AmountResult {
  const candidates = collectNumberCandidates(tokens);

  if (candidates.length === 0) {
    return { rejection: "amount_indeterminate" };
  }

  let winner: NumberCandidate;

  if (candidates.length === 1) {
    winner = candidates[0]!;
  } else {
    const marked = candidates.filter((candidate) => candidate.marked);
    if (marked.length !== 1) {
      return { rejection: "amount_indeterminate" };
    }
    winner = marked[0]!;
  }

  const amount = parseWellFormedAmount(winner.raw);
  if (amount === null) {
    return { rejection: "amount_malformed" };
  }

  if (amount === 0) {
    return { rejection: "amount_zero" };
  }

  return { amount, consumedTokens: winner.span };
}
