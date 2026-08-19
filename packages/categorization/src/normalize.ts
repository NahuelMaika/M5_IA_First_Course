/**
 * Text normalization for comparison purposes only (kb.md "Normalizacion para
 * comparar"). Never applied to the value that gets persisted -- callers keep
 * the original `Lugar`/`Descripcion` as the user typed it.
 *
 * Steps, in order:
 * 1. Lowercase.
 * 2. Decompose to Unicode Normalization Form D (NFD) and discard combining
 *    diacritical marks (U+0300-U+036F), so `medico` (accented) and `medico`
 *    compare equal. The form is fixed explicitly here (mitigation R-03):
 *    mixing normalization forms across callers would make the same text
 *    compare unequal to itself.
 * 3. Collapse consecutive whitespace into a single space and trim both ends.
 *
 * Returns a new string; never mutates or otherwise alters the input, which
 * strings cannot be mutated in JavaScript to begin with, but the contract is
 * documented here because callers must not assume in-place normalization.
 */

const COMBINING_DIACRITICAL_MARKS = /[\u0300-\u036f]/g;
const WHITESPACE_RUN = /\s+/g;

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_DIACRITICAL_MARKS, "")
    .replace(WHITESPACE_RUN, " ")
    .trim();
}
