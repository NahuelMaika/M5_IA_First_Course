import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Block 10 quality gate (NFR-01, AC-26).
 *
 * The real coverage gate lives in `vitest.config.ts`'s `coverage.thresholds`
 * -- Vitest fails the run itself when a metric dips below 90%, which is not
 * something a test body can observe or re-assert at runtime (the resolved
 * coverage config isn't exposed to test code). The test below anchors that
 * the thresholds are declared at all, so a future edit that silently drops
 * or lowers them fails this suite instead of only being caught the next
 * time someone happens to run `--coverage` and reads the summary by eye.
 *
 * Same pattern as `packages/categorization/tests/coverage.test.ts` -- this
 * parses the config's SOURCE text, it never imports the config module.
 */

const DOMAIN_DIR = resolve(import.meta.dirname, "..");

describe("coverage thresholds are configured to fail the suite (NFR-01, AC-26)", () => {
  it("vitest.config.ts declares lines/branches/functions thresholds >= 90", () => {
    const configSource = readFileSync(join(DOMAIN_DIR, "vitest.config.ts"), "utf-8");

    const thresholdsBlock = configSource.match(/thresholds:\s*\{([^}]*)\}/);
    expect(thresholdsBlock, "vitest.config.ts must declare coverage.thresholds").not.toBeNull();

    const block = thresholdsBlock![1];
    for (const metric of ["lines", "branches", "functions"] as const) {
      const match = block.match(new RegExp(`${metric}:\\s*(\\d+)`));
      expect(match, `thresholds.${metric} must be set`).not.toBeNull();
      expect(Number(match![1])).toBeGreaterThanOrEqual(90);
    }
  });

  it("performance.test.ts is excluded from the instrumented coverage run", () => {
    const configSource = readFileSync(join(DOMAIN_DIR, "vitest.config.ts"), "utf-8");

    expect(configSource).toMatch(/exclude:\s*\[[^\]]*tests\/performance\.test\.ts[^\]]*\]/);
  });
});
