import { describe, expect, it } from "vitest";
import { convertWordNumerals } from "../src/numerals.ts";

/**
 * Tests for Block 5's word-numeral to digit conversion
 * (spec-FEAT-001b Block 5, kb.md "Numerales en Palabras", FR-05).
 */
describe("convertWordNumerals", () => {
  it("AC-09: 'gaste mil quinientos en nafta' converts 'mil quinientos' to 1500", () => {
    const tokens = ["gaste", "mil", "quinientos", "en", "nafta"];

    const result = convertWordNumerals(tokens);

    expect(result).toEqual(["gaste", "1500", "en", "nafta"]);
  });

  it("AC-09: 'treinta y cinco mil el alquiler' converts the whole sequence to 35000, leaving 'alquiler' intact", () => {
    const tokens = ["treinta", "y", "cinco", "mil", "el", "alquiler"];

    const result = convertWordNumerals(tokens);

    expect(result).toEqual(["35000", "el", "alquiler"]);
  });

  it("AC-10: 'me compre una remera 25000' does not convert the isolated article 'una'", () => {
    const tokens = ["me", "compre", "una", "remera", "25000"];

    const result = convertWordNumerals(tokens);

    expect(result).toEqual(["me", "compre", "una", "remera", "25000"]);
  });

  it("'un millon' converts as a sequence with a multiplier (1000000)", () => {
    const tokens = ["un", "millon"];

    const result = convertWordNumerals(tokens);

    expect(result).toEqual(["1000000"]);
  });

  it("'mil quinientos pesos de luz' discards 'pesos' adjacent to the converted amount", () => {
    const tokens = ["mil", "quinientos", "pesos", "de", "luz"];

    const result = convertWordNumerals(tokens);

    expect(result).toEqual(["1500", "de", "luz"]);
  });

  it("sums within the group and multiplies with 'mil': 'dos mil trescientos' -> 2300", () => {
    const tokens = ["dos", "mil", "trescientos"];

    const result = convertWordNumerals(tokens);

    expect(result).toEqual(["2300"]);
  });

  it("'veintiun mil' converts using the 21-29 single-token range with a multiplier", () => {
    const tokens = ["veintiun", "mil"];

    const result = convertWordNumerals(tokens);

    expect(result).toEqual(["21000"]);
  });

  it("a numeral above the 999.999.999 cap is not recognized and stays as text", () => {
    const tokens = ["mil", "millones"];

    const result = convertWordNumerals(tokens);

    expect(result).toEqual(["mil", "millones"]);
  });

  it("a numeral exactly at the 999.999.999 cap converts", () => {
    const tokens = ["novecientos", "noventa", "y", "nueve", "millones"];

    const result = convertWordNumerals(tokens);

    expect(result).toEqual(["999000000"]);
  });

  it("leaves tokens untouched when no numeral is present", () => {
    const tokens = ["cafe", "1500"];

    const result = convertWordNumerals(tokens);

    expect(result).toEqual(["cafe", "1500"]);
  });

  it("compares numeral tokens without distinguishing case or accents", () => {
    const tokens = ["MIL", "QUINIENTOS"];

    const result = convertWordNumerals(tokens);

    expect(result).toEqual(["1500"]);
  });

  it("does not discard 'pesos' when it is not immediately adjacent to a number", () => {
    const tokens = ["mil", "quinientos", "de", "luz", "pesos"];

    const result = convertWordNumerals(tokens);

    expect(result).toEqual(["1500", "de", "luz", "pesos"]);
  });

  it("an isolated 'uno' or 'un' does not convert either", () => {
    expect(convertWordNumerals(["uno", "cafe"])).toEqual(["uno", "cafe"]);
    expect(convertWordNumerals(["un", "cafe"])).toEqual(["un", "cafe"]);
  });
});
