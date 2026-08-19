/**
 * Converts word-form numerals to digit tokens, on the left segment, after
 * temporal references and the category marker have been stripped and
 * before the Monto is determined (kb.md "Numerales en Palabras", FR-05,
 * AC-06).
 *
 * Recognizes a closed table of numeral words (0-15, 16-29, decenas,
 * centenas, and the `mil` / `millón` / `millones` multipliers), compared by
 * whole token, case- and accent-insensitive (kb.md line 223). A maximal
 * contiguous run of numeral tokens is collapsed into a single digit token
 * representing its value -- summed within each scale group, multiplied by
 * `mil` / `millón(es)` (kb.md rule 2). The connecting `y` between a decena
 * and its unit (`treinta y cinco`) is part of the numeral, not a plain
 * connector (kb.md rule 1).
 *
 * `un` / `una` / `uno` in isolation are articles, not numerals (kb.md rule
 * 5): they only count as the value 1 when immediately followed by a
 * multiplier (`un millón`, `veintiún mil` -- the latter already a single
 * 21-29 token, not this special case). A bare `mil` implies an omitted
 * "un" (`mil pesos` = 1000), but `millón` / `millones` require an explicit
 * count word before them, since kb.md always spells one out (`un millón`,
 * never a bare `millón`). So a multiplier run that reaches
 * `millón`/`millones` with nothing accumulated since the start of the run
 * or the last multiplier (e.g. `mil millones`) is not recognized -- not
 * because the quantity is ungrammatical in Spanish, but because this
 * implementation requires the explicit count kb.md always shows. It stays
 * as text, the same outcome a `mil millones` run would hit anyway from
 * exceeding the 999.999.999 cap (kb.md rule 3).
 *
 * `peso` / `pesos` immediately following a converted run is discarded
 * along with it (kb.md rule 6) -- no other currency word or abbreviation
 * is recognized.
 */

const CAP = 999_999_999;

// Same NFD-strip approach as temporal.ts, built from code points (not a
// literal range in source) so all pipeline stages normalize identically
// (kb.md "Normalización y Tokenización").
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

// kb.md "Tabla de numerales", 0-15.
const UNIT_WORDS: Record<string, number> = {
  cero: 0,
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
};

// 16-29, single token each (kb.md line 228).
const SIXTEEN_TO_TWENTY_NINE_WORDS: Record<string, number> = {
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  veintiuno: 21,
  veintiun: 21,
  veintidos: 22,
  veintitres: 23,
  veinticuatro: 24,
  veinticinco: 25,
  veintiseis: 26,
  veintisiete: 27,
  veintiocho: 28,
  veintinueve: 29,
};

// Decenas (kb.md line 229).
const TENS_WORDS: Record<string, number> = {
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
};

// Centenas (kb.md line 230).
const HUNDREDS_WORDS: Record<string, number> = {
  cien: 100,
  ciento: 100,
  doscientos: 200,
  trescientos: 300,
  cuatrocientos: 400,
  quinientos: 500,
  seiscientos: 600,
  setecientos: 700,
  ochocientos: 800,
  novecientos: 900,
};

const VALUE_WORDS: Record<string, number> = {
  ...UNIT_WORDS,
  ...SIXTEEN_TO_TWENTY_NINE_WORDS,
  ...TENS_WORDS,
  ...HUNDREDS_WORDS,
};

// Multiplicadores (kb.md line 231). `mil` allows an implicit "1" when
// nothing was accumulated before it; `millon`/`millones` never do (see the
// module doc comment) -- tracked via `impliesOne`.
const MULTIPLIER_WORDS: Record<string, { value: number; impliesOne: boolean }> = {
  mil: { value: 1_000, impliesOne: true },
  millon: { value: 1_000_000, impliesOne: false },
  millones: { value: 1_000_000, impliesOne: false },
};

const ARTICLE_WORDS = new Set(["un", "una", "uno"]);

const CURRENCY_WORDS = new Set(["peso", "pesos"]);

type TokenKind =
  | { type: "value"; value: number }
  | { type: "multiplier"; value: number; impliesOne: boolean }
  | { type: "glue" } // the "y" that joins a decena with its unit
  | { type: "other" };

// Classifies every token up front, one lookahead pass, so an isolated
// article or a stray "y" never gets treated as numeral text later on.
function classifyTokens(tokens: string[]): TokenKind[] {
  const normalized = tokens.map(normalizeToken);

  return normalized.map((token, index) => {
    // Checked before the generic VALUE_WORDS lookup: "uno" is also in the
    // 0-15 table, but kb.md rule 5 singles out "un"/"una"/"uno" as never
    // converting in isolation, only when a multiplier immediately follows.
    if (ARTICLE_WORDS.has(token)) {
      const next = normalized[index + 1];
      if (next !== undefined && next in MULTIPLIER_WORDS) {
        return { type: "value", value: 1 };
      }
      return { type: "other" };
    }

    if (token in VALUE_WORDS) {
      return { type: "value", value: VALUE_WORDS[token]! };
    }

    if (token in MULTIPLIER_WORDS) {
      const multiplier = MULTIPLIER_WORDS[token]!;
      return { type: "multiplier", value: multiplier.value, impliesOne: multiplier.impliesOne };
    }

    if (token === "y") {
      const previous = normalized[index - 1];
      const next = normalized[index + 1];
      const previousIsTens = previous !== undefined && previous in TENS_WORDS;
      const nextIsUnit =
        next !== undefined && next in UNIT_WORDS && UNIT_WORDS[next]! >= 1 && UNIT_WORDS[next]! <= 9;

      if (previousIsTens && nextIsUnit) {
        return { type: "glue" };
      }
      return { type: "other" };
    }

    return { type: "other" };
  });
}

interface NumeralRun {
  start: number;
  end: number; // exclusive
}

// A run is any maximal contiguous stretch of "value" / "multiplier" /
// "glue" tokens. Grammatical validity (and the cap) is checked separately
// when trying to parse the run's value.
function findNumeralRuns(kinds: TokenKind[]): NumeralRun[] {
  const runs: NumeralRun[] = [];
  let start: number | null = null;

  for (let index = 0; index <= kinds.length; index += 1) {
    const isNumeralToken = index < kinds.length && kinds[index]!.type !== "other";

    if (isNumeralToken && start === null) {
      start = index;
    } else if (!isNumeralToken && start !== null) {
      // A run may not end on a trailing "glue" token ("y") with nothing
      // after it -- that "y" was only classified as glue because it looked
      // ahead at a following unit, so this cannot actually happen, but
      // guard defensively by trimming a dangling glue token off the run.
      let end = index;
      while (end > start && kinds[end - 1]!.type === "glue") {
        end -= 1;
      }
      if (end > start) {
        runs.push({ start, end });
      }
      start = null;
    }
  }

  return runs;
}

// Attempts to compute the numeric value of one run. Returns null when the
// run doesn't satisfy the composition rule above (a multiplier that
// requires an explicit preceding group finds none) or exceeds the cap.
function parseRunValue(kinds: TokenKind[], run: NumeralRun): number | null {
  let total = 0;
  let group = 0;
  let groupHasExplicitValue = false;

  for (let index = run.start; index < run.end; index += 1) {
    const kind = kinds[index]!;

    if (kind.type === "value") {
      group += kind.value;
      groupHasExplicitValue = true;
      continue;
    }

    if (kind.type === "glue") {
      continue;
    }

    if (kind.type === "multiplier") {
      if (!groupHasExplicitValue && !kind.impliesOne) {
        return null;
      }
      const chunk = groupHasExplicitValue ? group : 1;
      total += chunk * kind.value;
      group = 0;
      groupHasExplicitValue = false;
      continue;
    }
  }

  total += group;

  if (total > CAP) {
    return null;
  }

  return total;
}

/**
 * Converts every maximal run of word-form numerals in `tokens` to a single
 * digit token holding its value. A run that is grammatically invalid or
 * exceeds 999.999.999 is left untouched, as plain text (kb.md rule 3). A
 * `peso`/`pesos` token immediately following a converted run is dropped
 * along with it (kb.md rule 6).
 */
export function convertWordNumerals(tokens: string[]): string[] {
  const kinds = classifyTokens(tokens);
  const runs = findNumeralRuns(kinds);

  const result: string[] = [];
  let cursor = 0;

  for (const run of runs) {
    const value = parseRunValue(kinds, run);

    // Copy through any non-numeral tokens before this run untouched.
    for (let index = cursor; index < run.start; index += 1) {
      result.push(tokens[index]!);
    }

    if (value === null) {
      // Invalid/over-cap run: keep its original tokens as text.
      for (let index = run.start; index < run.end; index += 1) {
        result.push(tokens[index]!);
      }
      cursor = run.end;
      continue;
    }

    result.push(String(value));
    cursor = run.end;

    const currencyToken = tokens[cursor];
    if (currencyToken !== undefined && CURRENCY_WORDS.has(normalizeToken(currencyToken))) {
      cursor += 1;
    }
  }

  for (let index = cursor; index < tokens.length; index += 1) {
    result.push(tokens[index]!);
  }

  return result;
}
