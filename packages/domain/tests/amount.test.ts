import { describe, expect, it } from "vitest";
import { determineAmount } from "../src/amount.ts";

/**
 * Tests for Block 6's Monto tie-break table
 * (spec-FEAT-001b Block 6, kb.md "Extracción de Campos desde Texto Libre" ->
 * "Monto", FR-06, NFR-05).
 */
describe("determineAmount", () => {
  it("AC-11: 'cafe 1500' -> exactly one number, no '$' required, resolves to 1500", () => {
    const tokens = ["cafe", "1500"];

    const result = determineAmount(tokens);

    expect(result).toEqual({ amount: 1500, consumedTokens: { start: 1, end: 2 } });
  });

  it("AC-12: '2 cafes $3000' -> several numbers, the '$'-marked one wins", () => {
    const tokens = ["2", "cafes", "$3000"];

    const result = determineAmount(tokens);

    expect(result).toEqual({ amount: 3000, consumedTokens: { start: 2, end: 3 } });
  });

  it("AC-12: a '$' followed by a plain number token (space-separated form) marks it", () => {
    const tokens = ["2", "cafes", "$", "3000"];

    const result = determineAmount(tokens);

    expect(result).toEqual({ amount: 3000, consumedTokens: { start: 2, end: 4 } });
  });

  it("AC-13: 'cafe 1.500,50' interprets es-AR thousands/decimal separators -> 1500.50", () => {
    const tokens = ["cafe", "1.500,50"];

    const result = determineAmount(tokens);

    expect(result).toEqual({ amount: 1500.5, consumedTokens: { start: 1, end: 2 } });
  });

  it("AC-18: '2 cafes 3000' -> several numbers, none marked, is ambiguous", () => {
    const tokens = ["2", "cafes", "3000"];

    const result = determineAmount(tokens);

    expect(result).toEqual({ rejection: "amount_indeterminate" });
  });

  it("AC-18: 'ruta 2 5000' -> several numbers, none marked, is ambiguous", () => {
    const tokens = ["ruta", "2", "5000"];

    const result = determineAmount(tokens);

    expect(result).toEqual({ rejection: "amount_indeterminate" });
  });

  it("no number present is indeterminate", () => {
    const tokens = ["milanesas"];

    const result = determineAmount(tokens);

    expect(result).toEqual({ rejection: "amount_indeterminate" });
  });

  it("several numbers with more than one marked '$' is ambiguous, not a malformed amount", () => {
    const tokens = ["$1000", "de", "$2000"];

    const result = determineAmount(tokens);

    expect(result).toEqual({ rejection: "amount_indeterminate" });
  });

  it("AC-19: 'cafe 1.5' is malformed -- a thousands group with fewer than 3 digits", () => {
    const tokens = ["cafe", "1.5"];

    const result = determineAmount(tokens);

    expect(result).toEqual({ rejection: "amount_malformed" });
  });

  it("AC-19: 'cafe 1.50' is malformed -- same reason as 1.5", () => {
    const tokens = ["cafe", "1.50"];

    const result = determineAmount(tokens);

    expect(result).toEqual({ rejection: "amount_malformed" });
  });

  it("AC-19: 'cafe 1500,555' is malformed -- more than 2 decimals", () => {
    const tokens = ["cafe", "1500,555"];

    const result = determineAmount(tokens);

    expect(result).toEqual({ rejection: "amount_malformed" });
  });

  it("NFR-05 mitigation: an amount with more than 2 decimals is never truncated nor rounded, only rejected", () => {
    const tokens = ["1500,999"];

    const result = determineAmount(tokens);

    // Neither truncated to 1500.99 nor rounded to 1501.00 -- rejected outright.
    expect(result).not.toEqual({ amount: 1500.99 });
    expect(result).not.toEqual({ amount: 1501 });
    expect(result).toEqual({ rejection: "amount_malformed" });
  });

  it("a well-formed thousands-grouped amount without decimals is accepted", () => {
    const tokens = ["12.345.678"];

    const result = determineAmount(tokens);

    expect(result).toEqual({ amount: 12345678, consumedTokens: { start: 0, end: 1 } });
  });

  it("`3000$` never marks the amount -- the '$' only marks the number that FOLLOWS it", () => {
    const tokens = ["cafe", "3000", "$"];

    const result = determineAmount(tokens);

    // Exactly one number token ('3000'); the trailing lone '$' has no effect
    // and does not create a second candidate.
    expect(result).toEqual({ amount: 3000, consumedTokens: { start: 1, end: 2 } });
  });

  it("a '$' with no number after it has no effect, and a single remaining number still resolves", () => {
    const tokens = ["cafe", "$", "3000"];

    const result = determineAmount(tokens);

    expect(result).toEqual({ amount: 3000, consumedTokens: { start: 1, end: 3 } });
  });

  it("an amount over the 999.999.999,99 cap is rejected", () => {
    const tokens = ["1.000.000.000"];

    const result = determineAmount(tokens);

    expect(result).toEqual({ rejection: "amount_malformed" });
  });

  it("the exact cap amount 999.999.999,99 is accepted", () => {
    const tokens = ["999.999.999,99"];

    const result = determineAmount(tokens);

    expect(result).toEqual({ amount: 999999999.99, consumedTokens: { start: 0, end: 1 } });
  });

  it("AC-28: 'cafe 0' -> a well-formed amount that resolves to exactly 0 is rejected", () => {
    const tokens = ["cafe", "0"];

    const result = determineAmount(tokens);

    expect(result).toEqual({ rejection: "amount_zero" });
  });
});
