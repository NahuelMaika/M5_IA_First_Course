/**
 * Discards filler words from the left segment's remaining tokens to produce
 * Lugar (kb.md "Descarte de Muletillas", FR-07). Runs last in the pipeline
 * order, over tokens that already had Monto, temporal references and the
 * category marker removed (Blocks 3, 4, 6).
 *
 * Two closed, normative lists, compared by whole token, case- and accent-
 * insensitive (kb.md line 276):
 * - Spending verbs: discarded in ANY position.
 * - Connectors: trimmed only from the extremes, re-evaluating the new edge
 *   after each discard, until neither the first nor the last token is in the
 *   list (or no token remains). Interior connectors are never touched, so
 *   compound place names (`obra social`, `casa de comidas`) survive intact.
 *
 * Neither list ever intersects the categorization keyword table or its
 * plurals (kb.md line 301) -- that invariant is covered by Block 10's
 * `invariant.test.ts`, out of this block's scope.
 *
 * This function never rejects anything -- an empty result (Lugar vacío) is
 * just an empty array. Turning that into the `empty_place` rejection is
 * Block 8's job, once it orchestrates every stage (kb.md "Solo el vacío
 * rechaza").
 */

// Same NFD-strip approach as temporal.ts/numerals.ts, built from code points
// so every pipeline stage normalizes identically (kb.md "Normalización y
// Tokenización").
const COMBINING_DIACRITICAL_MARKS_PATTERN = new RegExp(
  `[\\u${(0x0300).toString(16).padStart(4, "0")}-\\u${(0x036f).toString(16).padStart(4, "0")}]`,
  "g",
);

function normalizeToken(token: string): string {
  return token
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_DIACRITICAL_MARKS_PATTERN, "");
}

// kb.md line 278 -- closed and normative, discarded in any position.
const SPENDING_VERB_WORDS = new Set([
  "gaste",
  "gasto",
  "gastamos",
  "pague",
  "pago",
  "pagamos",
  "compre",
  "compra",
  "compramos",
  "puse",
  "salio",
  "costo",
  "me",
  "se",
  "fue",
]);

// kb.md line 285-286 -- closed and normative, trimmed only at the extremes.
const CONNECTOR_WORDS = new Set([
  "en",
  "de",
  "del",
  "a",
  "al",
  "por",
  "para",
  "con",
  "y",
  "el",
  "la",
  "los",
  "las",
  "un",
  "una",
  "lo",
  "que",
  "mi",
]);

/**
 * Discards spending verbs (any position) and trims connectors from both
 * extremes (kb.md rules 2-3). The remainder, once empty tokens are collapsed
 * out, is Lugar.
 *
 * The extreme-trim uses `start`/`end` index pointers over the array left
 * after verb removal, resolved in a single `slice` -- never
 * `Array#shift()`/`unshift()` in a loop. Those methods re-index every
 * remaining element on each call, making a naive trim loop O(n^2); this is
 * exactly the vector the threat model's HIGH-risk mitigation targets: a
 * 500-character input built entirely out of closed-list tokens (see
 * `filler-words.test.ts`'s adversarial performance tests).
 */
export function stripFillerWords(tokens: string[]): string[] {
  const withoutVerbs = tokens.filter(
    (token) => !SPENDING_VERB_WORDS.has(normalizeToken(token)),
  );

  let start = 0;
  let end = withoutVerbs.length; // exclusive

  while (start < end && CONNECTOR_WORDS.has(normalizeToken(withoutVerbs[start]!))) {
    start += 1;
  }

  while (end > start && CONNECTOR_WORDS.has(normalizeToken(withoutVerbs[end - 1]!))) {
    end -= 1;
  }

  return withoutVerbs.slice(start, end);
}
