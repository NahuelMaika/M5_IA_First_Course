import { describe, expect, it } from "vitest";

import { getRejectionMessage, type RejectionReason } from "./rejection-messages";

// The 8 `RejectionReason` values a 422 from `POST /expenses` can carry (packages/domain/src/types.ts).
const ALL_REASONS: RejectionReason[] = [
  "empty_left_segment",
  "amount_indeterminate",
  "amount_malformed",
  "amount_zero",
  "empty_place",
  "future_date",
  "date_out_of_window",
  "length_exceeded",
];

describe("getRejectionMessage (Block 7 — spec-FEAT-003b)", () => {
  it.each(ALL_REASONS)(
    "maps %s to a non-empty Spanish message",
    (reason) => {
      const message = getRejectionMessage(reason);
      expect(typeof message).toBe("string");
      expect(message.trim().length).toBeGreaterThan(0);
    },
  );

  it("maps every one of the 8 reasons to a DIFFERENT message (no shared generic fallback)", () => {
    const messages = ALL_REASONS.map((reason) => getRejectionMessage(reason));
    expect(new Set(messages).size).toBe(ALL_REASONS.length);
  });

  it("throws -- instead of returning a generic message -- for a reason outside the 8 mapped values", () => {
    const unmappedReason = "not_a_real_reason" as RejectionReason;
    expect(() => getRejectionMessage(unmappedReason)).toThrow();
  });
});
