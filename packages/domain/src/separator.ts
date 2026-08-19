/**
 * Cuts a raw expense sentence at the first Descripcion separator "-"
 * surrounded by whitespace (kb.md "Extraccion de Campos desde Texto
 * Libre", Paso 0).
 */

export interface SplitDescriptionResult {
  left: string;
  description: string;
}

// JS's \s also matches U+00A0 (non-breaking space). Building the excluded
// character from its code point avoids a hard-to-see literal in source, and
// keeps a non-breaking space from being mistaken for a real separator
// boundary, per kb.md lines 113-117.
const NON_BREAKING_SPACE = String.fromCharCode(160);
const REAL_WHITESPACE_PATTERN = new RegExp(`^[^\\S${NON_BREAKING_SPACE}]$`);

function isRealWhitespace(char: string): boolean {
  return REAL_WHITESPACE_PATTERN.test(char);
}

function isValidSeparatorHyphen(raw: string, index: number): boolean {
  const isLeftBoundaryOk = index === 0 || isRealWhitespace(raw[index - 1]);
  const isRightBoundaryOk =
    index + 1 < raw.length && isRealWhitespace(raw[index + 1]);

  return isLeftBoundaryOk && isRightBoundaryOk;
}

function findSeparatorHyphenIndex(raw: string): number {
  for (let index = 0; index < raw.length; index += 1) {
    if (raw[index] === "-" && isValidSeparatorHyphen(raw, index)) {
      return index;
    }
  }

  return -1;
}

export function splitDescription(raw: string): SplitDescriptionResult {
  const hyphenIndex = findSeparatorHyphenIndex(raw);

  if (hyphenIndex === -1) {
    return { left: raw, description: "" };
  }

  let leftEnd = hyphenIndex;
  while (leftEnd > 0 && isRealWhitespace(raw[leftEnd - 1])) {
    leftEnd -= 1;
  }

  let rightStart = hyphenIndex + 1;
  while (rightStart < raw.length && isRealWhitespace(raw[rightStart])) {
    rightStart += 1;
  }

  return {
    left: raw.slice(0, leftEnd),
    description: raw.slice(rightStart),
  };
}
