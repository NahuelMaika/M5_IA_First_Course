import { describe, expect, it } from "vitest";

import { createExpenseBodySchema } from "../../src/schemas/expense.ts";

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
