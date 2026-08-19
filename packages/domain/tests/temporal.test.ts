import { describe, expect, it } from "vitest";
import { extractTemporalReference, resolveWhen } from "../src/temporal.ts";

/**
 * Tests for Block 3's temporal reference extraction/resolution
 * (spec-FEAT-001b Block 3, kb.md "Extracción de Campos desde Texto Libre" ->
 * "Cuando", FR-02/FR-03).
 */

// Spanish weekday names indexed exactly like JS's Date#getDay() (0 = Sunday).
const WEEKDAY_TOKENS = [
  "domingo",
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
];

describe("extractTemporalReference", () => {
  it("AC-04: recognizes 'ayer' and removes it from the remaining tokens", () => {
    const referenceDate = new Date(2026, 7, 18);
    const tokens = ["nafta", "8000", "ayer"];

    const result = extractTemporalReference(tokens, referenceDate);

    expect(result.when?.getTime()).toBe(new Date(2026, 7, 17).getTime());
    expect(result.remainingTokens).toEqual(["nafta", "8000"]);
  });

  it("AC-05: an invalid calendar 'dd/mm' does not resolve a date and stays in the text", () => {
    const referenceDate = new Date(2026, 7, 18);
    const tokens = ["31/2"];

    const result = extractTemporalReference(tokens, referenceDate);

    expect(result.when).toBeNull();
    expect(result.remainingTokens).toEqual(["31/2"]);
  });

  it("AC-06: no temporal reference present yields when=null", () => {
    const referenceDate = new Date(2026, 7, 18);
    const tokens = ["cafe", "1500"];

    const result = extractTemporalReference(tokens, referenceDate);

    expect(result.when).toBeNull();
    expect(result.remainingTokens).toEqual(["cafe", "1500"]);
  });

  it("recognizes 'hoy' as the reference date itself", () => {
    const referenceDate = new Date(2026, 7, 18);
    const tokens = ["cafe", "1500", "hoy"];

    const result = extractTemporalReference(tokens, referenceDate);

    expect(result.when?.getTime()).toBe(new Date(2026, 7, 18).getTime());
    expect(result.remainingTokens).toEqual(["cafe", "1500"]);
  });

  it("recognizes 'anteayer' as two days back", () => {
    const referenceDate = new Date(2026, 7, 18);
    const tokens = ["cafe", "1500", "anteayer"];

    const result = extractTemporalReference(tokens, referenceDate);

    expect(result.when?.getTime()).toBe(new Date(2026, 7, 16).getTime());
  });

  it("recognizes an explicit 'dd/mm' date using the reference date's year", () => {
    const referenceDate = new Date(2026, 7, 18);
    const tokens = ["cafe", "1500", "3/8"];

    const result = extractTemporalReference(tokens, referenceDate);

    expect(result.when?.getTime()).toBe(new Date(2026, 7, 3).getTime());
    expect(result.remainingTokens).toEqual(["cafe", "1500"]);
  });

  it("recognizes an explicit 'dd/mm/aaaa' date with its own year", () => {
    const referenceDate = new Date(2026, 7, 18);
    const tokens = ["cafe", "1500", "3/8/1998"];

    const result = extractTemporalReference(tokens, referenceDate);

    expect(result.when?.getTime()).toBe(new Date(1998, 7, 3).getTime());
  });

  it("resolves a weekday name to the most recent occurrence without passing today", () => {
    const referenceDate = new Date(2026, 7, 18);
    const targetDow = (referenceDate.getDay() + 5) % 7; // guaranteed different from today
    const expectedDiff = (referenceDate.getDay() - targetDow + 7) % 7;
    const expected = new Date(2026, 7, 18 - expectedDiff);
    const tokens = ["nafta", WEEKDAY_TOKENS[targetDow]!];

    const result = extractTemporalReference(tokens, referenceDate);

    expect(result.when?.getTime()).toBe(expected.getTime());
    expect(result.remainingTokens).toEqual(["nafta"]);
  });

  it("resolves a weekday name that is today to today itself", () => {
    const referenceDate = new Date(2026, 7, 18);
    const todayName = WEEKDAY_TOKENS[referenceDate.getDay()]!;
    const tokens = [todayName, "8000", "nafta"];

    const result = extractTemporalReference(tokens, referenceDate);

    expect(result.when?.getTime()).toBe(new Date(2026, 7, 18).getTime());
    expect(result.remainingTokens).toEqual(["8000", "nafta"]);
  });

  it("compares tokens without distinguishing case or accents", () => {
    const referenceDate = new Date(2026, 7, 18);
    const tokens = ["nafta", "8000", "AYER"];

    const result = extractTemporalReference(tokens, referenceDate);

    expect(result.when?.getTime()).toBe(new Date(2026, 7, 17).getTime());
    expect(result.remainingTokens).toEqual(["nafta", "8000"]);
  });

  it("takes the first reference when several are present, and removes all of them", () => {
    const referenceDate = new Date(2026, 7, 18);
    const tokens = ["nafta", "ayer", "8000", "anteayer"];

    const result = extractTemporalReference(tokens, referenceDate);

    expect(result.when?.getTime()).toBe(new Date(2026, 7, 17).getTime());
    expect(result.remainingTokens).toEqual(["nafta", "8000"]);
  });

  it("does not recognize a malformed month ('45/13') as a reference", () => {
    const referenceDate = new Date(2026, 7, 18);
    const tokens = ["45/13"];

    const result = extractTemporalReference(tokens, referenceDate);

    expect(result.when).toBeNull();
    expect(result.remainingTokens).toEqual(["45/13"]);
  });
});

describe("resolveWhen", () => {
  it("AC-06: falls back to referenceDate when nothing was extracted", () => {
    const referenceDate = new Date(2026, 7, 18);

    const result = resolveWhen(null, referenceDate);

    expect(result).toBeInstanceOf(Date);
    expect((result as Date).getTime()).toBe(new Date(2026, 7, 18).getTime());
  });

  it("AC-21: rejects a resolved future date as 'future_date', without inferring a previous year", () => {
    const referenceDate = new Date(2026, 0, 15); // January
    const tokens = ["31/12"];
    const { when } = extractTemporalReference(tokens, referenceDate);

    const result = resolveWhen(when, referenceDate);

    expect(result).toBe("future_date");
  });

  it("AC-22: rejects a resolved date outside the 12-closed-month retroactivity window as 'date_out_of_window'", () => {
    const referenceDate = new Date(2026, 7, 18);
    const tokens = ["3/8/1998"];
    const { when } = extractTemporalReference(tokens, referenceDate);

    const result = resolveWhen(when, referenceDate);

    expect(result).toBe("date_out_of_window");
  });

  it("accepts a resolved date within the retroactivity window", () => {
    const referenceDate = new Date(2026, 7, 18);
    const tokens = ["ayer"];
    const { when } = extractTemporalReference(tokens, referenceDate);

    const result = resolveWhen(when, referenceDate);

    expect(result).toBeInstanceOf(Date);
    expect((result as Date).getTime()).toBe(new Date(2026, 7, 17).getTime());
  });

  it("accepts today itself (not treated as future)", () => {
    const referenceDate = new Date(2026, 7, 18);

    const result = resolveWhen(new Date(2026, 7, 18), referenceDate);

    expect(result).toBeInstanceOf(Date);
    expect((result as Date).getTime()).toBe(new Date(2026, 7, 18).getTime());
  });
});
