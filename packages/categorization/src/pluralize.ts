/**
 * Plural derivation for the keyword table (kb.md "Reglas de coincidencia",
 * rule 3, lines 336-358). Three rules, not two:
 *
 * 1. Mechanical regular plural derivation, applied per token:
 *    - a keyword ending in an unaccented vowel takes `+s`
 *      (`farmacia`->`farmacias`, `cine`->`cines`, `taxi`->`taxis`)
 *    - a keyword ending in a consonant other than `z` takes `+es`
 *      (`bar`->`bares`, `tren`->`trenes`, `doctor`->`doctores`)
 *    - a keyword ending in `z` replaces it with `ces`
 *      (`luz`->`luces`)
 *    Multi-token keywords pluralize every token (`obra social`->
 *    `obras sociales`).
 * 2. Invariants (kb.md:350-355): brands, acronyms and loanwords that do not
 *    take a plural (`netflix` matches, `netflixes` does not).
 * 3. The reverse case (kb.md:347-348): `expensas` and `anteojos` are
 *    already stored in plural in the keyword table, so they must ALSO
 *    match their singulars (`expensa`, `anteojo`). This is neither
 *    mechanical derivation nor the invariants list -- it runs in the
 *    opposite direction, and it is NOT combined with rule 1: an
 *    already-plural entry is not mechanically "pluralized" again.
 *
 * Rule 1 is applied to the NORMALIZED form of each keyword (via
 * `normalize()`, which strips accents), because matching always compares
 * normalized input tokens against the keyword table (kb.md "Reglas de
 * coincidencia", rule 1: "sin distinguir mayúsculas ni acentos"). This is
 * also what resolves an ending that kb.md's table does not spell out
 * explicitly: a keyword like `café`, which ends in an ACCENTED vowel in its
 * literal spelling. Normalizing first strips the accent (`café`->`cafe`),
 * so by the time the ending is inspected it is the unaccented-vowel case
 * the table already covers, and the result (`cafes`) is what the table's
 * own rule produces without needing a fourth row for stressed vowels.
 *
 * The pluralized table (`PLURALIZED_KEYWORDS`) is computed ONCE, at module
 * load -- never per invocation (mitigation R-02, implementation
 * requirement, not an optional optimization). It is a plain exported
 * `const`, not a function: an ES module body runs exactly once and is
 * cached across every importer, so "computed once" is a language
 * guarantee here, not a property a getter needs to protect.
 *
 * Each entry's `forms` are stored PRE-TOKENIZED (`readonly string[]` per
 * form, not a space-joined string). The consumer (categorizer, Block 4)
 * matches multi-token keywords as a contiguous sliding window over the
 * Lugar's tokens; if forms were space-joined it would have to `split(" ")`
 * them on every call (the other half of the recompute risk R-02 names) or
 * re-join the Lugar's tokens into a string and substring-match it, which
 * kb.md's rule 1 forbids. Tokenizing once here keeps the hot path free of
 * `split`/`join`.
 */

import { normalize } from "./normalize.ts";
import { CATEGORY_KEYWORDS } from "./keywords.ts";

/**
 * Marks, acronyms and loanwords that do not pluralize in Spanish
 * (kb.md:350-355). Closed and normative, transcribed as written.
 */
export const INVARIANT_KEYWORDS: ReadonlySet<string> = new Set([
  "delivery",
  "streaming",
  "netflix",
  "spotify",
  "uber",
  "cabify",
  "internet",
  "edenor",
  "edesur",
  "rappi",
  "pedidosya",
  "mcdonalds",
  "coto",
  "carrefour",
  "jumbo",
  "changomas",
  "makro",
  "ypf",
  "shell",
  "axion",
  "didi",
  "gnc",
  "vtv",
  "abl",
  "arba",
  "afip",
  "wifi",
  "flow",
  "telecom",
  "movistar",
  "fibertel",
  "telecentro",
  "directv",
  "metrogas",
  "aysa",
  "disney",
  "youtube",
  "twitch",
  "steam",
  "xbox",
  "playstation",
  "nintendo",
  "osde",
  "swiss",
  "medicus",
  "galeno",
  "gym",
  "spa",
  "jean",
  "sommier",
  "shampoo",
]);

/**
 * Keywords stored already in plural form in the table (kb.md:347-348),
 * mapped to the singular they must also match. Normalized keys/values.
 */
export const REVERSE_PLURAL_KEYWORDS: ReadonlyMap<string, string> = new Map([
  ["expensas", "expensa"],
  ["anteojos", "anteojo"],
]);

function isInvariantToken(token: string): boolean {
  return INVARIANT_KEYWORDS.has(token);
}

/** Derives the regular plural of a single already-normalized token. */
function pluralizeToken(token: string): string {
  if (token.endsWith("z")) {
    return `${token.slice(0, -1)}ces`;
  }
  if (/[aeiou]$/.test(token)) {
    return `${token}s`;
  }
  return `${token}es`;
}

/**
 * Derives the regular plural of a normalized, space-separated keyword
 * (possibly multi-token), pluralizing every token. Returns `null` when any
 * token of the keyword is an invariant -- the keyword as a whole has no
 * recognized plural form.
 */
function derivePluralForm(normalizedKeyword: string): string | null {
  const tokens = normalizedKeyword.split(" ");
  if (tokens.some(isInvariantToken)) {
    return null;
  }
  return tokens.map(pluralizeToken).join(" ");
}

export interface KeywordMatch {
  category: string;
  /** The keyword as listed in kb.md, normalized. Diagnostic only. */
  keyword: string;
  /**
   * Every normalized form that should match this keyword, each already
   * split into tokens: the listed form itself, plus its derived plural
   * (rule 1) or its reverse singular (rule 3) when applicable. Invariants
   * (rule 2) contain only the listed form. The consumer matches these as
   * a contiguous token window against the Lugar's tokens -- no
   * `split`/`join` needed at match time.
   */
  forms: readonly (readonly string[])[];
}

function buildPluralizedKeywords(): KeywordMatch[] {
  const entries: KeywordMatch[] = [];

  for (const { category, keywords } of CATEGORY_KEYWORDS) {
    for (const rawKeyword of keywords) {
      const keyword = normalize(rawKeyword);
      const forms = new Set<string>([keyword]);

      const reverseSingular = REVERSE_PLURAL_KEYWORDS.get(keyword);
      if (reverseSingular !== undefined) {
        // Rule 3: already plural in the table -- add its singular, do NOT
        // also mechanically pluralize an already-plural word.
        forms.add(reverseSingular);
      } else {
        // Rule 1 / rule 2: mechanical plural, or null for invariants.
        const plural = derivePluralForm(keyword);
        if (plural !== null) {
          forms.add(plural);
        }
      }

      entries.push({
        category,
        keyword,
        forms: Array.from(forms, (form) => form.split(" ")),
      });
    }
  }

  return entries;
}

/**
 * The precomputed keyword-match table. Computed once, at module load
 * (mitigation R-02) -- ES modules are evaluated once and cached, so this
 * top-level call runs exactly once per process regardless of how many
 * times the module is imported. Plain `const`, not an accessor: there is
 * no lazy init and no parameters, so a function wrapper would only add an
 * indirection with nothing behind it.
 */
export const PLURALIZED_KEYWORDS: readonly KeywordMatch[] = buildPluralizedKeywords();
