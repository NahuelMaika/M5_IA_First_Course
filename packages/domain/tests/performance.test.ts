import { describe, expect, it } from "vitest";
import { createCategorizer } from "@ggasia/categorization";
import { parseExpense } from "../src/parse-expense.ts";

/**
 * Block 10 performance gate (NFR-03, AC-27).
 *
 * Excluded from `coverage.include`/`exclude` in `vitest.config.ts` because
 * instrumentation skews timings -- see that file's comment. p95 (not the
 * average) is asserted, and cold-start iterations are discarded before
 * measuring, so a CI hiccup on a single run doesn't tank the whole suite
 * the way an average would, and the failure message reports the measured
 * value so "code is slow" and "CI was loaded" stay distinguishable.
 *
 * Uses the REAL `createCategorizer()` from `@ggasia/categorization` (via its
 * public barrel, not a stub) so this measures the pipeline end-to-end, the
 * same way it runs in production -- a stub categorizer would hide the cost
 * of the one real dependency this package has (ADR-001).
 */

const WARMUP_ITERATIONS = 100;
const MEASURED_ITERATIONS = 1000;
const P95_THRESHOLD_MS = 10;
const REFERENCE_DATE = new Date(2026, 7, 18); // 2026-08-18

/**
 * Builds a 500-character raw input that `parseExpense` accepts end to end
 * (no rejection): a single `$`-marked Monto, a Lugar kept under its 200-char
 * cap by padding it with a spending-verb filler word (discarded from ANY
 * position, kb.md rule 2 -- so it inflates the raw left segment without
 * inflating the resulting Lugar), and a Descripción kept under its 300-char
 * cap. The exact wording carries no semantic weight -- what matters is that
 * the pipeline processes all 500 characters end to end without rejecting.
 */
function buildLongInput(): string {
  const placePad = "restaurante ".repeat(8); // survives the filler-word strip
  let left = `gaste $1500 en ${placePad}`;
  while (left.length < 247) {
    left += "gaste "; // spending verb -- discarded from any position (Block 7)
  }
  left = left.slice(0, 247).trimEnd();

  const separator = " - ";
  const descriptionBudget = 500 - left.length - separator.length;
  const description = "con amigos despues del laburo charlando de todo un poco ".repeat(10).slice(
    0,
    descriptionBudget,
  );

  return left + separator + description;
}

describe("parseExpense() performance (NFR-03, AC-27)", () => {
  it("p95 over 1000 runs on a 500-char accepted input is under 10ms", () => {
    const categorizer = createCategorizer();
    const raw = buildLongInput();
    expect(raw).toHaveLength(500);

    // Sanity check: this measures a real, successfully-parsed input, not a
    // rejection short-circuit -- a rejected input would skip most of the
    // pipeline and understate the cost this gate is meant to catch.
    const sample = parseExpense(raw, REFERENCE_DATE, categorizer);
    expect(sample.ok).toBe(true);

    for (let i = 0; i < WARMUP_ITERATIONS; i++) {
      parseExpense(raw, REFERENCE_DATE, categorizer);
    }

    const durations: number[] = [];
    for (let i = 0; i < MEASURED_ITERATIONS; i++) {
      const start = performance.now();
      parseExpense(raw, REFERENCE_DATE, categorizer);
      durations.push(performance.now() - start);
    }

    durations.sort((a, b) => a - b);
    const p95Index = Math.ceil(0.95 * durations.length) - 1;
    const p95 = durations[p95Index]!;

    expect(
      p95,
      `p95 latency was ${p95.toFixed(3)}ms over ${MEASURED_ITERATIONS} runs, expected < ${P95_THRESHOLD_MS}ms`,
    ).toBeLessThan(P95_THRESHOLD_MS);
  });
});
