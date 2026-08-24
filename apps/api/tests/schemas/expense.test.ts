import { describe, expect, it } from "vitest";

import { createExpenseBodySchema, updateExpenseBodySchema } from "../../src/schemas/expense.ts";

describe("createExpenseBodySchema (spec-FEAT-002 Block 7)", () => {
  it("fails validation when input is missing", () => {
    const result = createExpenseBodySchema.safeParse({});

    expect(result.success).toBe(false);
  });

  it("fails validation when input is an empty string", () => {
    const result = createExpenseBodySchema.safeParse({ input: "" });

    expect(result.success).toBe(false);
  });

  it("fails validation when input is not a string", () => {
    const result = createExpenseBodySchema.safeParse({ input: 123 });

    expect(result.success).toBe(false);
  });

  it("passes validation for a valid non-empty string input", () => {
    const result = createExpenseBodySchema.safeParse({ input: "café 1500" });

    expect(result.success).toBe(true);
  });
});

describe("updateExpenseBodySchema (spec-FEAT-005a Block 1)", () => {
  const VALID_UUID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

  it("accepts a PATCH with a single field (place) -- AC-01", () => {
    const result = updateExpenseBodySchema.safeParse({ place: "Kiosco" });

    expect(result.success).toBe(true);
  });

  it("accepts a PATCH with categoryId -- AC-04", () => {
    const result = updateExpenseBodySchema.safeParse({ categoryId: VALID_UUID });

    expect(result.success).toBe(true);
  });

  it("rejects an empty PATCH {}", () => {
    const result = updateExpenseBodySchema.safeParse({});

    expect(result.success).toBe(false);
  });

  it("rejects a negative amount", () => {
    const result = updateExpenseBodySchema.safeParse({ amount: -100 });

    expect(result.success).toBe(false);
  });

  it("rejects an amount with more than 2 decimals", () => {
    const result = updateExpenseBodySchema.safeParse({ amount: 19.999 });

    expect(result.success).toBe(false);
  });

  it("rejects an amount over 999999999.99", () => {
    const result = updateExpenseBodySchema.safeParse({ amount: 1000000000 });

    expect(result.success).toBe(false);
  });

  it("accepts a valid 2-decimal amount near the RNF-08 cap", () => {
    const result = updateExpenseBodySchema.safeParse({ amount: 157974820.33 });

    expect(result.success).toBe(true);
  });

  it("accepts the RNF-08 cap itself", () => {
    const result = updateExpenseBodySchema.safeParse({ amount: 999999999.99 });

    expect(result.success).toBe(true);
  });

  it("rejects an empty place", () => {
    const result = updateExpenseBodySchema.safeParse({ place: "" });

    expect(result.success).toBe(false);
  });

  it("rejects a place longer than 200 chars", () => {
    const result = updateExpenseBodySchema.safeParse({ place: "a".repeat(201) });

    expect(result.success).toBe(false);
  });

  it("rejects a future when", () => {
    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

    const result = updateExpenseBodySchema.safeParse({ when: oneYearFromNow.toISOString() });

    expect(result.success).toBe(false);
  });

  it("rejects a when before the 12-month retroactivity floor", () => {
    const wayBeforeFloor = new Date();
    wayBeforeFloor.setFullYear(wayBeforeFloor.getFullYear() - 2);

    const result = updateExpenseBodySchema.safeParse({ when: wayBeforeFloor.toISOString() });

    expect(result.success).toBe(false);
  });

  it("rejects a categoryId that isn't a valid UUID", () => {
    const result = updateExpenseBodySchema.safeParse({ categoryId: "not-a-uuid" });

    expect(result.success).toBe(false);
  });

  it("accepts a PATCH with description -- AC-11", () => {
    const result = updateExpenseBodySchema.safeParse({ description: "Compra del mes" });

    expect(result.success).toBe(true);
  });

  it("accepts a PATCH that clears description to \"\" -- AC-11", () => {
    const result = updateExpenseBodySchema.safeParse({ description: "" });

    expect(result.success).toBe(true);
  });

  it("rejects a description longer than 300 chars -- AC-12", () => {
    const result = updateExpenseBodySchema.safeParse({ description: "a".repeat(301) });

    expect(result.success).toBe(false);
  });
});
