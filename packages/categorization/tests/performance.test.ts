import { describe, expect, it } from "vitest";
import { createCategorizer } from "../src/index.ts";

/**
 * Block 7 performance gate (NFR-06, AC-17).
 *
 * Excluded from `coverage.include`/`exclude` in `vitest.config.ts` because
 * instrumentation skews timings -- see that file's comment. p95 (not the
 * average) is asserted, and cold-start iterations are discarded before
 * measuring, so a CI hiccup on a single run doesn't tank the whole suite
 * the way an average would, and the failure message reports the measured
 * value so "code is slow" and "CI was loaded" stay distinguishable.
 */

const WARMUP_ITERATIONS = 100;
const MEASURED_ITERATIONS = 1000;
const P95_THRESHOLD_MS = 5;

describe("categorize() performance (NFR-06, AC-17)", () => {
  it("p95 over 1000 runs on a 200-char Lugar is under 5ms", () => {
    const categorizer = createCategorizer();
    const place = "avenida corrientes ".repeat(11).slice(0, 200);
    expect(place).toHaveLength(200);

    for (let i = 0; i < WARMUP_ITERATIONS; i++) {
      categorizer.categorize(place);
    }

    const durations: number[] = [];
    for (let i = 0; i < MEASURED_ITERATIONS; i++) {
      const start = performance.now();
      categorizer.categorize(place);
      durations.push(performance.now() - start);
    }

    durations.sort((a, b) => a - b);
    const p95Index = Math.ceil(0.95 * durations.length) - 1;
    const p95 = durations[p95Index];

    expect(
      p95,
      `p95 latency was ${p95.toFixed(3)}ms over ${MEASURED_ITERATIONS} runs, expected < ${P95_THRESHOLD_MS}ms`,
    ).toBeLessThan(P95_THRESHOLD_MS);
  });
});
