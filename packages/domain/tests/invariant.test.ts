import { describe, expect, it } from "vitest";
import { CONNECTOR_WORDS, SPENDING_VERB_WORDS } from "../src/filler-words.ts";
// Cross-package read of categorization's normative keyword data, for a TEST
// only -- never from production `src/` code. `packages/categorization`
// deliberately keeps `PLURALIZED_KEYWORDS`/`CATEGORY_KEYWORDS` out of its
// public barrel (they are normative data, not a shared primitive, per
// ADR-001 and `packages/categorization/src/index.ts`'s own docblock), so
// this invariant test reaches them through the package's dedicated
// `/testing` subpath export (`packages/categorization/src/testing.ts`)
// instead of a relative `src/` import. This keeps AGENTS.md's "consume
// compiled" rule intact -- the data is read through the compiled
// `@ggasia/categorization` package, not its source tree -- while still
// documenting the exception explicitly rather than widening the public
// barrel.
import { CATEGORY_KEYWORDS, PLURALIZED_KEYWORDS } from "@ggasia/categorization/testing";

/**
 * Block 10 invariant gate (NFR-06, AC-25): the two closed filler-word lists
 * (Block 7) must never intersect the categorization keyword table or any of
 * its derived plural/singular forms. If a filler word matched a keyword, it
 * would either get silently discarded from Lugar (losing the word the
 * categorizer needs) or would falsely categorize Lugar based on connector
 * noise -- kb.md line 301 requires the two vocabularies to be disjoint by
 * construction, and this test is what makes a future violation fail loudly
 * instead of surfacing as a categorization regression nobody can trace back.
 */

function buildKeywordTokenSet(): Set<string> {
  const tokens = new Set<string>();
  for (const entry of PLURALIZED_KEYWORDS) {
    for (const form of entry.forms) {
      for (const token of form) {
        tokens.add(token);
      }
    }
  }
  return tokens;
}

describe("filler words never intersect the categorization keyword table (NFR-06, AC-25)", () => {
  it("documents the total keyword count as a canary against silent additions/removals", () => {
    const totalKeywords = CATEGORY_KEYWORDS.reduce(
      (sum, entry) => sum + entry.keywords.length,
      0,
    );

    expect(totalKeywords).toBe(258);
  });

  it("no spending-verb token appears among the keyword table's forms (including derived plurals/singulars)", () => {
    const keywordTokens = buildKeywordTokenSet();

    const conflicts = [...SPENDING_VERB_WORDS].filter((token) => keywordTokens.has(token));

    expect(
      conflicts,
      `spending-verb token(s) found in the keyword table: ${conflicts.join(", ")}`,
    ).toEqual([]);
  });

  it("no connector token appears among the keyword table's forms (including derived plurals/singulars)", () => {
    const keywordTokens = buildKeywordTokenSet();

    const conflicts = [...CONNECTOR_WORDS].filter((token) => keywordTokens.has(token));

    expect(
      conflicts,
      `connector token(s) found in the keyword table: ${conflicts.join(", ")}`,
    ).toEqual([]);
  });

  it("no token from either filler-word list appears among the keyword table's forms, checked as one combined pass over 100% of both lists", () => {
    const keywordTokens = buildKeywordTokenSet();
    const fillerTokens = new Set([...SPENDING_VERB_WORDS, ...CONNECTOR_WORDS]);

    const conflicts = [...fillerTokens].filter((token) => keywordTokens.has(token));

    expect(
      conflicts,
      `filler-word token(s) found in the keyword table: ${conflicts.join(", ")}`,
    ).toEqual([]);
  });
});
