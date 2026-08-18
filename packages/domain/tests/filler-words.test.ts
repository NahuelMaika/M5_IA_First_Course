import { describe, expect, it } from "vitest";
import { stripFillerWords } from "../src/filler-words.ts";

/**
 * Tests for Block 7's filler-word discard (spec-FEAT-001b Block 7, kb.md
 * "Descarte de Muletillas", FR-07).
 *
 * Per the spec, `stripFillerWords` receives only the tokens left after the
 * earlier pipeline stages (amount, temporal reference, category marker) have
 * already run -- these tests pass hand-picked token arrays directly, the same
 * convention `numerals.test.ts` and `category-marker.test.ts` already use.
 */
describe("stripFillerWords", () => {
  it("AC-14: 'gaste 18000 en milanesas hoy' -> discards the spending verb and the edge connector, leaving 'milanesas'", () => {
    const tokens = ["gaste", "en", "milanesas"];

    const result = stripFillerWords(tokens);

    expect(result).toEqual(["milanesas"]);
  });

  it("AC-14: 'cena en la casa de mi vieja 3000' -> interior connectors are left untouched", () => {
    const tokens = ["cena", "en", "la", "casa", "de", "mi", "vieja"];

    const result = stripFillerWords(tokens);

    expect(result).toEqual(["cena", "en", "la", "casa", "de", "mi", "vieja"]);
  });

  it("AC-20: 'gaste 5000 en' -> empty Lugar (verb discarded anywhere, trailing connector trimmed)", () => {
    const tokens = ["gaste", "en"];

    const result = stripFillerWords(tokens);

    expect(result).toEqual([]);
  });

  it("a single token that is itself a connector is discarded, leaving an empty Lugar", () => {
    const tokens = ["en"];

    const result = stripFillerWords(tokens);

    expect(result).toEqual([]);
  });

  it("a single token that is itself a spending verb is discarded, leaving an empty Lugar", () => {
    const tokens = ["gaste"];

    const result = stripFillerWords(tokens);

    expect(result).toEqual([]);
  });

  it("discards every spending verb regardless of position, not only at the edges", () => {
    const tokens = ["pague", "el", "kiosco", "y", "compre", "algo"];

    const result = stripFillerWords(tokens);

    // "pague" and "compre" (spending verbs) are removed wherever they sit;
    // "el" (leading connector) is trimmed; "y" stays because it is interior
    // once "pague"/"compre" are gone, "algo" is not a connector so trimming
    // stops there.
    expect(result).toEqual(["kiosco", "y", "algo"]);
  });

  it("compares tokens without distinguishing case or accents", () => {
    const tokens = ["GASTE", "En", "Milanesas"];

    const result = stripFillerWords(tokens);

    expect(result).toEqual(["Milanesas"]);
  });

  it("trims trailing connectors from the right only, leaving the leading token and interior content untouched", () => {
    // "parrilla" is neither a spending verb nor a connector, so the left
    // pointer never advances -- this isolates the right-side trim loop
    // (`end -= 1`), which here runs twice ("el" then "en") before landing on
    // "amigos", a non-connector. "con" survives because it is interior once
    // the right edge stops moving, not because it was ever re-evaluated by
    // the left pointer.
    const tokens = ["parrilla", "con", "amigos", "en", "el"];

    const result = stripFillerWords(tokens);

    expect(result).toEqual(["parrilla", "con", "amigos"]);
  });

  it("leaves tokens untouched when none of them are filler words", () => {
    const tokens = ["kiosco"];

    const result = stripFillerWords(tokens);

    expect(result).toEqual(["kiosco"]);
  });

  it("returns an empty array for an empty input", () => {
    expect(stripFillerWords([])).toEqual([]);
  });

  describe("performance (threat model mitigation, HIGH risk: O(n) edge-trim, never shift()/unshift() in a loop)", () => {
    it("resolves a 500-character all-connector adversarial input in a few milliseconds", () => {
      const raw = "en ".repeat(167).trimEnd(); // >= 500 chars, all closed-list connector tokens
      expect(raw.length).toBeGreaterThanOrEqual(500);
      const tokens = raw.split(" ");

      const start = performance.now();
      const result = stripFillerWords(tokens);
      const elapsed = performance.now() - start;

      expect(result).toEqual([]);
      expect(elapsed, `took ${elapsed.toFixed(3)}ms for ${tokens.length} tokens`).toBeLessThan(10);
    });

    it("scales linearly, not quadratically, on a large all-filler token array", () => {
      // If edge-trimming used shift()/unshift() in a loop (O(n) per call), a
      // 8x increase in token count would take roughly 64x longer (O(n^2)).
      // With index pointers (O(n) total), it should take roughly 8x longer,
      // or less -- so a growth factor far below 64x proves the mitigation
      // holds without depending on absolute wall-clock thresholds alone.
      const buildTokens = (count: number): string[] => new Array(count).fill("en");

      const small = buildTokens(2_000);
      const large = buildTokens(16_000); // 8x the small size

      const timeOf = (tokens: string[]): number => {
        const start = performance.now();
        stripFillerWords(tokens);
        return performance.now() - start;
      };

      // Warm up once so JIT compilation doesn't skew the very first measurement.
      timeOf(buildTokens(100));

      const smallTime = Math.max(timeOf(small), 0.001);
      const largeTime = Math.max(timeOf(large), 0.001);

      expect(
        largeTime / smallTime,
        `large/small time ratio was ${(largeTime / smallTime).toFixed(2)}x for an 8x size increase (small: ${smallTime.toFixed(3)}ms, large: ${largeTime.toFixed(3)}ms)`,
      ).toBeLessThan(32);
      expect(largeTime).toBeLessThan(50);
    });
  });
});
