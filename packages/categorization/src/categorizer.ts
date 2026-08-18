/**
 * Core categorizer (kb.md "Categorización Automática", FR-05/FR-07/FR-08).
 *
 * Walks `PLURALIZED_KEYWORDS` in its stored order, which preserves
 * `CATEGORY_KEYWORDS`' normative category order (Block 3): assigns the
 * FIRST category whose keyword matches as a contiguous token window --
 * not the best match, not an occurrence count (kb.md "Reglas de
 * coincidencia", desempate por orden).
 *
 * Never writes the Lugar anywhere observable (NFR-03) and makes no
 * external call of any kind. An unmatched Lugar is a valid product
 * outcome, not an error -- this function never throws for Lugar content.
 */

import { normalize } from "./normalize.ts";
import { tokenize } from "./tokenize.ts";
import { PLURALIZED_KEYWORDS } from "./pluralize.ts";

export const UNCATEGORIZED = "Otros";

/** Whether `form` occurs as a contiguous, in-order window of `tokens`. */
function matchesWindow(tokens: readonly string[], form: readonly string[]): boolean {
  if (form.length === 0 || form.length > tokens.length) return false;

  for (let start = 0; start <= tokens.length - form.length; start++) {
    let matched = true;
    for (let offset = 0; offset < form.length; offset++) {
      if (tokens[start + offset] !== form[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }

  return false;
}

/**
 * Categorizes a Lugar via deterministic keyword matching. Returns `Otros`
 * for an empty Lugar or one that matches no keyword (FR-08) -- it never
 * rejects or throws based on the Lugar's content.
 */
export function categorize(place: string): string {
  const tokens = tokenize(normalize(place));
  if (tokens.length === 0) return UNCATEGORIZED;

  for (const { category, forms } of PLURALIZED_KEYWORDS) {
    for (const form of forms) {
      if (matchesWindow(tokens, form)) {
        return category;
      }
    }
  }

  return UNCATEGORIZED;
}
