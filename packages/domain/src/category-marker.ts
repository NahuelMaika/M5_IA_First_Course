/**
 * Recognizes and extracts the category marker `#nombre` from a raw expense
 * sentence's tokens (kb.md "Extracción de Campos desde Texto Libre" ->
 * "Categoría", FR-04).
 *
 * A valid marker is a whole token that starts with `#`, followed by at
 * least one valid character -- letters (with accents and `ñ`), digits,
 * `-` and `_`. A bare `#`, or a `#` where any of the following characters
 * is not in that set, is not a marker and is left untouched as common text
 * (kb.md line 181/185).
 *
 * If several valid markers are present, the first one wins `markedName`,
 * but every valid marker is removed from `remainingTokens` (same rule kb.md
 * applies to several temporal references -- see Block 3's
 * `extractTemporalReference`).
 *
 * This function does NOT resolve `markedName` against existing categories --
 * that is `resolveCategoryName` from FEAT-001a's `category-name.ts`,
 * explicitly out of scope here (kb.md line 175/176), so it is not imported.
 */

export interface CategoryMarkerExtractionResult {
  markedName: string | null;
  remainingTokens: string[];
}

// Letters (with accents and ñ, via the Unicode "Letter" category), digits,
// hyphen and underscore -- kb.md's exact character set for a marker's name.
// The whole remainder after "#" must match, not just the character right
// after it: a "#" followed by any invalid character anywhere in the token
// is not a marker.
const CATEGORY_MARKER_PATTERN = /^#([\p{L}0-9_-]+)$/u;

function matchCategoryMarker(token: string): string | null {
  const match = CATEGORY_MARKER_PATTERN.exec(token);
  return match ? match[1]! : null;
}

/**
 * Scans `tokens` for the first valid `#nombre` marker. Every valid marker
 * (not only the first) is removed from `remainingTokens`. Returns
 * `markedName: null` when no valid marker is found.
 */
export function extractCategoryMarker(
  tokens: string[],
): CategoryMarkerExtractionResult {
  let markedName: string | null = null;
  const remainingTokens: string[] = [];

  for (const token of tokens) {
    const name = matchCategoryMarker(token);

    if (name === null) {
      remainingTokens.push(token);
      continue;
    }

    if (markedName === null) {
      markedName = name;
    }
  }

  return { markedName, remainingTokens };
}
