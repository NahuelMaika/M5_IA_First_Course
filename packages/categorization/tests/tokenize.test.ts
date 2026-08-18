import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { tokenize } from "../src/tokenize.ts";
import { normalize } from "../src/normalize.ts";

/**
 * Block 2 tests for `tokenize` (FR-04, kb.md's token definition,
 * mitigation R-01).
 */

describe("tokenize", () => {
  it("compares by whole token, never by substring (AC-04)", () => {
    // A naive `text.split(/\s+/)` would leave the trailing punctuation
    // glued to the word ("naftalina," / "supermercadito."), so it would
    // fail this exact-equality check -- unlike a correct tokenizer, which
    // strips the punctuation and yields the bare token used for matching.
    expect(tokenize("naftalina,")).toEqual(["naftalina"]);
    expect(tokenize("supermercadito.")).toEqual(["supermercadito"]);
  });

  it("does not split on a hyphen between letters", () => {
    expect(tokenize("anti-mosquitos")).toEqual(["anti-mosquitos"]);
  });

  it("splits on punctuation other than a letter-to-letter hyphen, discarding it", () => {
    expect(tokenize("café,")).toEqual(["café"]);
  });

  it("does not split on '.' or ',' between digits (kb.md:43-44)", () => {
    expect(tokenize("1.500")).toEqual(["1.500"]);
    expect(tokenize("1500,50")).toEqual(["1500,50"]);
  });

  it("splits on '.' or ',' when not surrounded by digits on both sides", () => {
    expect(tokenize("a.b")).toEqual(["a", "b"]);
    expect(tokenize("1500,")).toEqual(["1500"]);
    expect(tokenize(",1500")).toEqual(["1500"]);
  });

  it("does not split on '/' between digits (kb.md:44)", () => {
    expect(tokenize("24/12/2026")).toEqual(["24/12/2026"]);
  });

  it("splits on '/' when not surrounded by digits on both sides", () => {
    expect(tokenize("a/b")).toEqual(["a", "b"]);
  });

  it("does not split on '#' at the start of a token, it stays attached (kb.md:46)", () => {
    expect(tokenize("#nombre")).toEqual(["#nombre"]);
    expect(tokenize("#5000")).toEqual(["#5000"]);
  });

  it("splits on '#' when it appears mid-token, discarding it", () => {
    expect(tokenize("abc#def")).toEqual(["abc", "def"]);
  });

  it("never discards '$' -- it survives tokenization per kb.md:47,52-55", () => {
    // $3000 -> one token, $ prefixes the digit run it marks.
    expect(tokenize("$3000")).toEqual(["$3000"]);
    // $ 3000 -> two tokens, separated by the space.
    expect(tokenize("$ 3000")).toEqual(["$", "3000"]);
    // 3000$ -> two tokens; $ does not attach to a preceding number.
    expect(tokenize("3000$")).toEqual(["3000", "$"]);
    // A lone $ with nothing after it -> a token by itself.
    expect(tokenize("$")).toEqual(["$"]);
  });

  it("resolves an adversarial hyphen chain without catastrophic backtracking (R-01)", () => {
    // A run that ALMOST matches a catastrophically-vulnerable pattern like
    // /(\p{L}+-)+\p{L}+/u, with a failing suffix, is what actually forces
    // backtracking on a vulnerable implementation -- unlike a run of pure
    // punctuation, which fails on the very first character and exercises
    // no backtracking at all.
    const adversarial = "a-".repeat(100) + "!";
    const expectedToken = Array.from({ length: 100 }, () => "a").join("-");

    const result = tokenize(adversarial);

    expect(result).toEqual([expectedToken]);
  });

  it("resolves 200 characters of repeated punctuation without degradation (spec-required, R-01)", () => {
    // Spec-FEAT-001a.md:166-167 and threat-FEAT-001a.md R-01 both name this
    // exact case explicitly: it must not be replaced by the hyphen-chain
    // adversarial case above -- both are required.
    const punctuationRun = ",".repeat(200);

    const result = tokenize(punctuationRun);

    // Every character is punctuation that splits and is discarded; no
    // digits surround any comma, so nothing survives.
    expect(result).toEqual([]);
  });

  it("returns an empty token list for empty or whitespace-only input, without throwing", () => {
    expect(() => tokenize("")).not.toThrow();
    expect(tokenize("")).toEqual([]);

    expect(() => tokenize("   \t\n  ")).not.toThrow();
    expect(tokenize("   \t\n  ")).toEqual([]);
  });

  it("splits multiple words on whitespace", () => {
    expect(tokenize("obra social swiss medical")).toEqual([
      "obra",
      "social",
      "swiss",
      "medical",
    ]);
  });

  it("does not split combining diacritical marks off the letter they attach to, when the input arrives in NFD (raw-NFD case)", () => {
    // "café" written with a decomposed accent: "cafe" + COMBINING ACUTE
    // ACCENT (U+0301). Without mark-continuation this yields ["caf", "e"]
    // because \p{L} does not match category Mn.
    const decomposedCafe = "café";

    expect(tokenize(decomposedCafe)).toEqual([decomposedCafe]);
  });

  it("stays correct on the documented normalize -> tokenize order (composition case)", () => {
    // normalize() already strips combining marks (NFD + discard), so by the
    // time tokenize() sees the text there is nothing left to decompose.
    // This pins that ordering contract explicitly.
    expect(tokenize(normalize("café"))).toEqual(["cafe"]);
  });

  it("does not cut the hyphen rule when the letter before it carries a combining mark (raw-NFD case)", () => {
    // "cafe" + COMBINING ACUTE ACCENT (U+0301) + "-bar", built from
    // explicit code points so the file's own encoding cannot silently
    // precompose it back to NFC: c, a, f, e, U+0301, -, b, a, r.
    const cafeBarNFD = "cafe\u0301-bar";

    expect(tokenize(cafeBarNFD)).toEqual([cafeBarNFD]);
  });

  it("does not split a digit run when a combining mark follows a digit (raw-NFD case)", () => {
    // digit "1", COMBINING ACUTE ACCENT (U+0301), digits "500" -- the mark
    // must continue the digit token instead of cutting it in two.
    const digitsWithMark = "1\u0301500";

    expect(tokenize(digitsWithMark)).toEqual([digitsWithMark]);
  });

  it("continues the token through stacked combining marks (raw-NFD case)", () => {
    // "u" + COMBINING DIAERESIS (U+0308) + COMBINING ACUTE ACCENT
    // (U+0301) + "ber", built from explicit code points. The second
    // mark's look-behind sees a mark, not a letter, and must still
    // resolve back to the letter "u" instead of cutting.
    const stackedMarks = "u\u0308\u0301ber";

    expect(tokenize(stackedMarks)).toEqual([stackedMarks]);
  });
});

describe("tokenize structural (no logging of the input)", () => {
  it("contains no console/logger calls or stdout writes", () => {
    const filePath = resolve(import.meta.dirname, "../src/tokenize.ts");
    const content = readFileSync(filePath, "utf-8");

    expect(content).not.toMatch(/console\./);
    expect(content).not.toMatch(/logger/i);
    expect(content).not.toMatch(/process\.stdout/);
  });
});
