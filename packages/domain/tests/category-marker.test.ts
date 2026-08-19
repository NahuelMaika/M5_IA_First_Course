import { describe, expect, it } from "vitest";
import { extractCategoryMarker } from "../src/category-marker.ts";

/**
 * Tests for Block 4's category marker extraction
 * (spec-FEAT-001b Block 4, kb.md "Extracción de Campos desde Texto Libre" ->
 * "Categoría", FR-04).
 */
describe("extractCategoryMarker", () => {
  it("AC-07: recognizes '#almuerzos' as a marker and removes it from the remaining tokens", () => {
    const tokens = ["milanesas", "18000", "#almuerzos"];

    const result = extractCategoryMarker(tokens);

    expect(result.markedName).toBe("almuerzos");
    expect(result.remainingTokens).toEqual(["milanesas", "18000"]);
  });

  it("AC-08: a lone '#' is not a marker and stays as common text", () => {
    const tokens = ["pague", "3000", "de", "nafta", "#", "ayer"];

    const result = extractCategoryMarker(tokens);

    expect(result.markedName).toBeNull();
    expect(result.remainingTokens).toEqual([
      "pague",
      "3000",
      "de",
      "nafta",
      "#",
      "ayer",
    ]);
  });

  it("takes the first marker when several are present, and removes all of them", () => {
    const tokens = ["#a", "8000", "nafta", "#b"];

    const result = extractCategoryMarker(tokens);

    expect(result.markedName).toBe("a");
    expect(result.remainingTokens).toEqual(["8000", "nafta"]);
  });

  it("returns markedName null and untouched tokens when no marker is present", () => {
    const tokens = ["cafe", "1500"];

    const result = extractCategoryMarker(tokens);

    expect(result.markedName).toBeNull();
    expect(result.remainingTokens).toEqual(["cafe", "1500"]);
  });

  it("recognizes accented letters and 'ñ' in the marked name", () => {
    const tokens = ["gasto", "500", "#peluquería_niño"];

    const result = extractCategoryMarker(tokens);

    expect(result.markedName).toBe("peluquería_niño");
    expect(result.remainingTokens).toEqual(["gasto", "500"]);
  });

  it("recognizes digits and hyphens in the marked name", () => {
    const tokens = ["gasto", "500", "#gasto-2024"];

    const result = extractCategoryMarker(tokens);

    expect(result.markedName).toBe("gasto-2024");
    expect(result.remainingTokens).toEqual(["gasto", "500"]);
  });

  it("a '#' followed by an invalid character is not a marker and stays as common text", () => {
    const tokens = ["gasto", "500", "#!"];

    const result = extractCategoryMarker(tokens);

    expect(result.markedName).toBeNull();
    expect(result.remainingTokens).toEqual(["gasto", "500", "#!"]);
  });

  it("does not resolve or normalize the marked name -- returns it raw", () => {
    const tokens = ["gasto", "500", "#Almuerzos"];

    const result = extractCategoryMarker(tokens);

    expect(result.markedName).toBe("Almuerzos");
  });
});
