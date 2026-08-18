import { describe, expect, it } from "vitest";
import type { Categorizer } from "@ggasia/categorization";
import { parseExpense } from "../src/parse-expense.ts";
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_NAME_LENGTH,
  MAX_PLACE_LENGTH,
  MAX_RAW_INPUT_LENGTH,
} from "../src/limits.ts";

/**
 * Golden-set tests for Block 8's pipeline orchestration (spec-FEAT-001b
 * Block 8, FR-08/FR-09/FR-10/FR-12/FR-13). Every test exercises
 * `parseExpense` from the raw input, never a stage in isolation -- per-stage
 * behavior is already covered by Blocks 2-7's own test files.
 */

const REFERENCE_DATE = new Date(2026, 7, 18); // 2026-08-18

/** Test double for the categorizer port (AC-17): never the concrete class. */
function createStubCategorizer(category = "Otros"): Categorizer & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    categorize(place: string): string {
      calls.push(place);
      return category;
    },
  };
}

describe("parseExpense", () => {
  describe("AC-15: default Nombre", () => {
    it("defaults Nombre to Lugar when Descripción is empty", () => {
      const result = parseExpense("milanesas 18000", REFERENCE_DATE, createStubCategorizer());

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.expense.place).toBe("milanesas");
      expect(result.expense.description).toBe("");
      expect(result.expense.name).toBe("milanesas");
    });

    it("defaults Nombre to 'Lugar - Descripción' when Descripción is present", () => {
      const result = parseExpense(
        "milanesas 18000 - con los pibes",
        REFERENCE_DATE,
        createStubCategorizer(),
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.expense.place).toBe("milanesas");
      expect(result.expense.description).toBe("con los pibes");
      expect(result.expense.name).toBe("milanesas - con los pibes");
    });
  });

  describe("AC-16: default Tipo", () => {
    it("always defaults Tipo to 'Personal'", () => {
      const result = parseExpense("cafe 1500", REFERENCE_DATE, createStubCategorizer());

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.expense.type).toBe("Personal");
    });
  });

  describe("AC-17: category origin", () => {
    it("without a marker, delegates to the injected categorizer port with origin 'automatica'", () => {
      const categorizer = createStubCategorizer("Comida");

      const result = parseExpense("cafe 1500", REFERENCE_DATE, categorizer);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.expense.category).toBe("Comida");
      expect(result.expense.categoryOrigin).toBe("automatica");
      expect(categorizer.calls).toEqual(["cafe"]);
    });

    it("with a marker, uses the raw marked name unresolved, with origin 'marcador', never calling the categorizer port", () => {
      const categorizer = createStubCategorizer("Comida");

      const result = parseExpense("milanesas 18000 #almuerzos", REFERENCE_DATE, categorizer);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.expense.category).toBe("almuerzos");
      expect(result.expense.categoryOrigin).toBe("marcador");
      expect(categorizer.calls).toEqual([]);
    });
  });

  describe("AC-23: length caps rejected before/without guessing an interpretation", () => {
    it("rejects raw input over 500 characters before interpreting anything", () => {
      const raw = "a".repeat(MAX_RAW_INPUT_LENGTH + 1);
      const categorizer = createStubCategorizer();

      const result = parseExpense(raw, REFERENCE_DATE, categorizer);

      expect(result).toEqual({ ok: false, rejection: { reason: "length_exceeded" } });
      // Never attempts interpretation -- the categorizer port is never touched.
      expect(categorizer.calls).toEqual([]);
    });

    it("rejects when Lugar exceeds its own cap, even though the raw input stays under 500", () => {
      const longPlace = "a".repeat(MAX_PLACE_LENGTH + 1);
      const raw = `${longPlace} 1500`;
      expect(raw.length).toBeLessThan(MAX_RAW_INPUT_LENGTH);

      const result = parseExpense(raw, REFERENCE_DATE, createStubCategorizer());

      expect(result).toEqual({ ok: false, rejection: { reason: "length_exceeded" } });
    });

    it("rejects when Descripción exceeds its own cap, even though the raw input stays under 500", () => {
      const longDescription = "b".repeat(MAX_DESCRIPTION_LENGTH + 1);
      const raw = `cafe 1500 - ${longDescription}`;
      expect(raw.length).toBeLessThan(MAX_RAW_INPUT_LENGTH);

      const result = parseExpense(raw, REFERENCE_DATE, createStubCategorizer());

      expect(result).toEqual({ ok: false, rejection: { reason: "length_exceeded" } });
    });

    // NOTE: a fourth case dedicated purely to Nombre's own cap (512) is not
    // constructible: MAX_PLACE_LENGTH + " - ".length + MAX_DESCRIPTION_LENGTH
    // = 200 + 3 + 300 = 503, always <= MAX_NAME_LENGTH (512). Once Lugar and
    // Descripción each pass their own cap (necessary to reach the point where
    // Nombre is computed), Nombre can never exceed 512 either -- see the
    // implementation report for details. This is documented, not silently
    // skipped.
    it("documents that Nombre can never exceed its cap once Lugar and Descripción are each within theirs", () => {
      // 150 + 250 stays comfortably under both MAX_PLACE_LENGTH/
      // MAX_DESCRIPTION_LENGTH and, combined with the raw input's own
      // overhead, under MAX_RAW_INPUT_LENGTH too -- large enough to show
      // the property (150 + 3 + 250 = 403 <= 512) without tripping the raw
      // input's own 500-char cap.
      const place = "a".repeat(150);
      const description = "b".repeat(250);
      const raw = `${place} 1500 - ${description}`;
      expect(raw.length).toBeLessThan(MAX_RAW_INPUT_LENGTH);

      const result = parseExpense(raw, REFERENCE_DATE, createStubCategorizer());

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.expense.name.length).toBeLessThanOrEqual(MAX_NAME_LENGTH);
    });
  });

  describe("AC-24: a marker in an input rejected for another reason never signals category creation", () => {
    it("rejects for empty_place without leaking any marker information", () => {
      const result = parseExpense(
        "gaste 5000 en #almuerzos",
        REFERENCE_DATE,
        createStubCategorizer(),
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.rejection).toEqual({ reason: "empty_place" });
      expect(Object.keys(result.rejection)).toEqual(["reason"]);
    });

    it("rejects for amount_indeterminate without leaking any marker information", () => {
      const result = parseExpense(
        "2 cafes 3000 #almuerzos",
        REFERENCE_DATE,
        createStubCategorizer(),
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.rejection).toEqual({ reason: "amount_indeterminate" });
      expect(Object.keys(result.rejection)).toEqual(["reason"]);
    });
  });

  describe("never throws on malformed input", () => {
    it.each(["", "   ", "- solo comentario", "gaste 5000 en"])(
      "returns a typed rejection instead of throwing for %j",
      (raw) => {
        expect(() => parseExpense(raw, REFERENCE_DATE, createStubCategorizer())).not.toThrow();
        const result = parseExpense(raw, REFERENCE_DATE, createStubCategorizer());
        expect(result.ok).toBe(false);
      },
    );
  });

  describe("end-to-end golden interactions between stages (mitigates stage-reordering risk)", () => {
    it("temporal reference ('ayer') + word numeral ('mil quinientos') resolve together into Cuando, Monto and Lugar", () => {
      const result = parseExpense(
        "nafta mil quinientos ayer",
        REFERENCE_DATE,
        createStubCategorizer("Transporte"),
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.expense.when.getTime()).toBe(new Date(2026, 7, 17).getTime());
      expect(result.expense.amount).toBe(1500);
      expect(result.expense.place).toBe("nafta");
    });

    it("a category marker + a '$'-marked amount among several numbers + surviving interior connectors resolve together", () => {
      const categorizer = createStubCategorizer();

      const result = parseExpense(
        "pague 2 cafes en la esquina $3000 #vicios",
        REFERENCE_DATE,
        categorizer,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.expense.amount).toBe(3000);
      expect(result.expense.category).toBe("vicios");
      expect(result.expense.categoryOrigin).toBe("marcador");
      expect(result.expense.place).toBe("2 cafes en la esquina");
      // marker wins -> the categorizer port is never consulted
      expect(categorizer.calls).toEqual([]);
    });

    it("AC-12: a space-separated '$' marker ('$' and the number as two tokens) resolves Monto and excludes both tokens from Lugar", () => {
      const categorizer = createStubCategorizer("Comida");

      const result = parseExpense(
        "pague 2 cafes en la esquina $ 3000",
        REFERENCE_DATE,
        categorizer,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.expense.amount).toBe(3000);
      // Neither the '$' nor the number token leak into Lugar.
      expect(result.expense.place).toBe("2 cafes en la esquina");
      expect(result.expense.place).not.toContain("$");
      expect(categorizer.calls).toEqual(["2 cafes en la esquina"]);
    });

    it("the Descripción separator + an explicit 'dd/mm' date + filler-word discard resolve together, leaving Descripción literal", () => {
      const result = parseExpense(
        "gaste 18000 en milanesas 3/8 - cumple de Ana",
        REFERENCE_DATE,
        createStubCategorizer("Comida"),
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.expense.when.getTime()).toBe(new Date(2026, 7, 3).getTime());
      expect(result.expense.amount).toBe(18000);
      expect(result.expense.place).toBe("milanesas");
      expect(result.expense.description).toBe("cumple de Ana");
      expect(result.expense.name).toBe("milanesas - cumple de Ana");
    });
  });
});
