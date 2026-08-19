/**
 * Splits text into tokens per the token definition this block implements
 * from kb.md's "Normalización y Tokenización" section (FR-04), lines 37-50
 * of the full table, complete:
 *
 * - whitespace splits and is discarded.
 * - `.` and `,` between two digits do not split (`1.500`, `1500,50`).
 * - `/` between two digits does not split (`24/12/2026`).
 * - `-` between two letters does not split (`anti-mosquitos` is one token).
 * - `#` at the start of a token does not split -- it stays attached to
 *   whatever follows (`#nombre`, `#5000`); mid-token it is ordinary
 *   punctuation and splits.
 * - `$` is never discarded (kb.md:47,52-55): it prefixes the digit run
 *   it marks when it opens a token immediately followed by a digit
 *   (`$3000` -> one token), and otherwise survives as its own
 *   single-character token (`3000$` -> `3000`, `$`; a lone `$` -> `$`).
 * - Any other punctuation splits the token and is discarded; it never
 *   survives as a token of its own. Comparison against this output is
 *   always by whole token, never by substring (`naftalina` never yields
 *   `nafta`).
 *
 * Ordering precondition (not covered by any AC, found while hardening
 * R-01): this function assumes NFC-or-untouched input, or input already
 * run through `normalize()`. `normalize()` decomposes to NFD and then
 * strips combining diacritical marks, so `normalize()` -> `tokenize()` is
 * always safe. Calling `tokenize()` directly on raw NFD text (a real
 * possibility: NFD is the default decomposition on Apple platforms, and
 * this product ingests audio transcription) is also safe: a combining mark
 * (`\p{M}`, Unicode category Mn) that follows a letter or a digit is
 * treated as continuing that letter/digit's token rather than splitting it
 * or cutting the surrounding number in two -- `\p{L}`/`\p{Nd}` alone do
 * not match Mn, so without this rule `tokenize("café")` in NFD form would
 * wrongly split into `["caf", "e"]`, and a mark landing inside a digit run
 * would wrongly cut one number into two separate numbers. This also holds
 * for stacked marks (e.g. the NFD of `ǘ`, which is `u` followed by TWO
 * combining marks): every rule that needs to know "what does this token
 * currently end in" resolves through the last letter-or-digit character
 * pushed, tracked incrementally as `lastSignificant`, not by re-scanning
 * back over `current` on every mark -- that keeps the walk-back O(1) per
 * character instead of O(k) per mark in a k-mark stack, which would make a
 * long run of stacked marks quadratic and reopen R-01. A combining mark
 * that does not follow a letter or digit (an orphan mark at the very
 * start of a token) is discarded defensively rather than starting a token
 * on its own, since a stray mark carries no meaning by itself.
 *
 * Implementation is a single linear scan over the code points of the input
 * (no regex quantifiers, no backtracking), per mitigation R-01: a Lugar of
 * repeated punctuation, or an adversarial near-match run, must resolve in
 * linear time.
 */

const LETTER = /\p{L}/u;
const DIGIT = /\p{Nd}/u;
const MARK = /\p{M}/u;

function isLetter(char: string | undefined): boolean {
  return char !== undefined && LETTER.test(char);
}

function isDigit(char: string | undefined): boolean {
  return char !== undefined && DIGIT.test(char);
}

function isMark(char: string | undefined): boolean {
  return char !== undefined && MARK.test(char);
}

function isLetterOrDigit(char: string): boolean {
  return isLetter(char) || isDigit(char);
}

export function tokenize(text: string): string[] {
  if (!text) return [];

  const chars = Array.from(text);
  const tokens: string[] = [];
  let current: string[] = [];

  // Last letter-or-digit character pushed into `current`, ignored by any
  // combining marks pushed after it. Every rule below that needs to know
  // what the token currently ends in (skipping over trailing marks)
  // resolves through this instead of re-scanning `current`, so a run of
  // stacked marks stays O(1) per character (see the docblock above).
  let lastSignificant: string | undefined;

  const flush = (): void => {
    if (current.length > 0) {
      tokens.push(current.join(""));
      current = [];
    }
    lastSignificant = undefined;
  };

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i]!;
    const next = chars[i + 1];

    if (isLetterOrDigit(char)) {
      current.push(char);
      lastSignificant = char;
      continue;
    }

    // Combining diacritical mark continuing a letter or digit already in
    // the current token (NFD input). An orphan mark at token start, or
    // one following another mark with no letter/digit behind it, is
    // discarded, not carried forward as its own token.
    if (isMark(char) && (isLetter(lastSignificant) || isDigit(lastSignificant))) {
      current.push(char);
      continue;
    }

    if (
      (char === "." || char === "," || char === "/") &&
      isDigit(lastSignificant) &&
      isDigit(next)
    ) {
      current.push(char);
      continue;
    }

    if (char === "-" && isLetter(lastSignificant) && isLetter(next)) {
      current.push(char);
      continue;
    }

    if (char === "#" && current.length === 0) {
      current.push(char);
      continue;
    }

    if (char === "$") {
      if (current.length === 0 && isDigit(next)) {
        current.push(char);
        continue;
      }
      flush();
      tokens.push("$");
      continue;
    }

    flush();
  }

  flush();
  return tokens;
}
