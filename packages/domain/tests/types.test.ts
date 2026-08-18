import { describe, expect, it } from "vitest";
import type { ParsedExpense, ParseResult, RejectedExpense } from "../src/types.ts";

/**
 * Smoke test for Block 1's domain types (spec-FEAT-001b Block 1). No pipeline
 * logic exists yet -- this only proves the shapes compile and discriminate
 * correctly, as required by the block's "Required tests".
 */
describe("ParseResult discrimination", () => {
  it("narrows to ParsedExpense when ok is true", () => {
    const expense: ParsedExpense = {
      amount: 1500.5,
      place: "milanesas",
      when: new Date("2026-08-11T00:00:00.000Z"),
      category: "Comida",
      categoryOrigin: "automatica",
      description: "con los pibes",
      name: "milanesas - con los pibes",
      type: "Personal",
    };
    const result: ParseResult = { ok: true, expense };

    expect(result.ok).toBe(true);
    if (result.ok) {
      // TypeScript narrowing: `result.expense` only exists on the ok branch.
      expect(result.expense.place).toBe("milanesas");
      expect(result.expense.categoryOrigin).toBe("automatica");
    } else {
      throw new Error("expected the ok:true branch");
    }
  });

  it("narrows to RejectedExpense when ok is false, discriminated by reason", () => {
    const rejection: RejectedExpense = { reason: "amount_indeterminate" };
    const result: ParseResult = { ok: false, rejection };

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rejection.reason).toBe("amount_indeterminate");
    } else {
      throw new Error("expected the ok:false branch");
    }
  });

  it("distinguishes every rejection reason without ambiguity", () => {
    const reasons: RejectedExpense["reason"][] = [
      "empty_left_segment",
      "amount_indeterminate",
      "amount_malformed",
      "empty_place",
      "future_date",
      "date_out_of_window",
      "length_exceeded",
    ];

    for (const reason of reasons) {
      const result: ParseResult = { ok: false, rejection: { reason } };
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.rejection.reason).toBe(reason);
      }
    }
  });
});
