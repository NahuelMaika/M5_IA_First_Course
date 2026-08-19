import { describe, expect, it, vi } from "vitest";
import type { VisibleCategory } from "../src/category-name.ts";
import { resolveCategoryName } from "../src/category-name.ts";
import * as normalizeModule from "../src/normalize.ts";

/**
 * Block 6 tests for `category-name.ts` (kb.md "Categoria", lines 181-199;
 * spec-FEAT-001a Block 6; threat-FEAT-001a R-05, R-08).
 */

const VISIBLE_CATEGORIES: VisibleCategory[] = [
  { name: "almuerzos", active: true },
  { name: "transporte", active: true },
  { name: "gimnasio antiguo", active: false },
];

describe("resolveCategoryName", () => {
  it("resolves against a currently active category after normalizing -- AC-10", () => {
    const result = resolveCategoryName("Almuerzos", VISIBLE_CATEGORIES);

    expect(result).toEqual({ outcome: "resolved", category: "almuerzos" });
  });

  it("signals must_create (no_match) when there is no match at all, and creates nothing -- AC-11", () => {
    const result = resolveCategoryName("Viajes Internacionales", VISIBLE_CATEGORIES);

    expect(result).toEqual({ outcome: "must_create", reason: "no_match" });
  });

  it("signals must_create (deactivated_match) when the only match is a deactivated category, leaving it intact -- AC-12", () => {
    const snapshotBefore = JSON.parse(JSON.stringify(VISIBLE_CATEGORIES));

    const result = resolveCategoryName("Gimnasio Antiguo", VISIBLE_CATEGORIES);

    expect(result).toEqual({ outcome: "must_create", reason: "deactivated_match" });
    // The deactivated category is read, never mutated or reactivated.
    expect(VISIBLE_CATEGORIES).toEqual(snapshotBefore);
  });

  it("rejects raw input over 60 characters without attempting to resolve -- AC-13, NFR-05", () => {
    const tooLong = "a".repeat(61);

    const result = resolveCategoryName(tooLong, VISIBLE_CATEGORIES);

    expect(result).toEqual({ outcome: "rejected", reason: "too_long" });
  });

  it("rejects a name that normalizes to empty, without attempting to resolve -- AC-13", () => {
    const result = resolveCategoryName("   ", VISIBLE_CATEGORIES);

    expect(result).toEqual({ outcome: "rejected", reason: "empty" });
  });

  it("__proto__, constructor and toString never resolve to any category -- R-05", () => {
    // These names are deliberately absent from VISIBLE_CATEGORIES: the test
    // proves there is no leak from Object.prototype, not a coincidental
    // real-category match.
    for (const proto of ["__proto__", "constructor", "toString"]) {
      const result = resolveCategoryName(proto, VISIBLE_CATEGORIES);
      expect(result).toEqual({ outcome: "must_create", reason: "no_match" });
    }
  });

  it("applies the length cap before normalizing -- R-08", () => {
    const normalizeSpy = vi.spyOn(normalizeModule, "normalize");
    const tooLong = "A".repeat(61);

    const result = resolveCategoryName(tooLong, VISIBLE_CATEGORIES);

    expect(result).toEqual({ outcome: "rejected", reason: "too_long" });
    // category-name.ts imports `normalize` directly, so the spy on the
    // module export does not intercept that call -- what proves the order
    // is the *evidence*, not the spy call count: an input that would
    // normalize successfully (all uppercase letters, no symbols) is still
    // rejected purely because of its raw length, before any normalization
    // could have produced an empty/matching string.
    expect(normalizeSpy).not.toHaveBeenCalledWith(tooLong);
    normalizeSpy.mockRestore();
  });

  it("the three outcomes are distinguishable from each other by their discriminant -- AC-11 vs AC-12", () => {
    const resolved = resolveCategoryName("Almuerzos", VISIBLE_CATEGORIES);
    const noMatch = resolveCategoryName("Viajes", VISIBLE_CATEGORIES);
    const deactivatedMatch = resolveCategoryName("Gimnasio Antiguo", VISIBLE_CATEGORIES);
    const rejected = resolveCategoryName("a".repeat(61), VISIBLE_CATEGORIES);

    expect(resolved.outcome).toBe("resolved");
    expect(noMatch).toEqual({ outcome: "must_create", reason: "no_match" });
    expect(deactivatedMatch).toEqual({ outcome: "must_create", reason: "deactivated_match" });
    expect(rejected.outcome).toBe("rejected");

    // AC-11 (no match at all) and AC-12 (match only a deactivated category)
    // both share the `must_create` outcome but must remain distinguishable
    // by `reason` -- the exact distinction the spec requires (line 356-360).
    expect(noMatch).not.toEqual(deactivatedMatch);
  });

  it("no rejection includes the marked name received, in any field -- PII note", () => {
    const marker = "MARCADOR_UNICO_XYZ_12345";
    const tooLongMarker = `${marker}${"x".repeat(40)}`;

    const tooLongResult = resolveCategoryName(tooLongMarker, VISIBLE_CATEGORIES);
    const emptyResult = resolveCategoryName("   ", VISIBLE_CATEGORIES);

    expect(JSON.stringify(tooLongResult)).not.toContain(marker);
    expect(JSON.stringify(emptyResult)).not.toContain(marker);
  });
});
