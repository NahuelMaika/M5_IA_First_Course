import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import type { ParseResult, ParsedExpense, RejectedExpense } from "../src/index.ts";

/**
 * Smoke test for Block 9's public barrel (spec-FEAT-001b Block 9).
 *
 * Runtime coverage (`parseExpense`) is exercised against the COMPILED
 * `dist/index.js`, never `src/index.ts`, since that is what real consumers
 * actually import (`main`/`exports` both point at `dist/`). Per ADR-002 (see
 * `packages/categorization/tests/purity.test.ts` for the full precedent),
 * this uses `spawnSync(process.execPath, ...)` against a real Node child
 * process instead of Vitest's in-process dynamic `import()`, which resolves
 * through Vite's own resolver rather than Node's ESM loader and would not
 * actually exercise the compiled artifact's real import graph.
 *
 * Type-only coverage (`ParseResult`/`ParsedExpense`/`RejectedExpense`) has no
 * runtime footprint to assert on -- it is instead proven by this very file:
 * the import above is type-checked by `tsc -p tsconfig.test.json`, and the
 * annotation below exercises `ParsedExpense`. If any of the three types were
 * missing from the barrel, `pnpm --filter @ggasia/domain run typecheck`
 * would fail to compile this file.
 */

const DOMAIN_DIR = resolve(import.meta.dirname, "..");
const DIST_INDEX = join(DOMAIN_DIR, "dist", "index.js");

describe("packages/domain public barrel (Block 9)", () => {
  it("dist/index.js exists (built before this suite runs, per the workspace's build-before-test chain)", () => {
    expect(existsSync(DIST_INDEX)).toBe(true);
  });

  it("the compiled barrel exports a working parseExpense end to end", () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), "ggasia-domain-barrel-"));
    const distIndexUrl = new URL(`file:///${DIST_INDEX.replace(/\\/g, "/")}`).href;

    // A real Node ESM script that imports the compiled barrel by absolute
    // file URL and invokes `parseExpense` with a real input, printing the
    // result as JSON so this test can assert on it -- this proves the
    // compiled function actually runs and resolves correctly, not just that
    // the import itself does not throw.
    const script = `
      import { parseExpense } from ${JSON.stringify(distIndexUrl)};
      const result = parseExpense(
        "cafe 1500",
        new Date(2026, 0, 1),
        { categorize: () => "Otros" },
      );
      process.stdout.write(JSON.stringify(result));
    `;
    const loaderPath = join(fixtureDir, "loader.mjs");
    writeFileSync(loaderPath, script);

    try {
      const result = spawnSync(process.execPath, [loaderPath], { encoding: "utf-8" });

      expect(result.status).toBe(0);
      const parsed: ParseResult = JSON.parse(result.stdout);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      expect(parsed.expense.amount).toBe(1500);
      expect(parsed.expense.place).toBe("cafe");
      expect(parsed.expense.category).toBe("Otros");
      expect(parsed.expense.categoryOrigin).toBe("automatica");
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it("does not export internal pipeline symbols beyond the spec's exact contract", () => {
    const distIndexUrl = new URL(`file:///${DIST_INDEX.replace(/\\/g, "/")}`).href;
    const fixtureDir = mkdtempSync(join(tmpdir(), "ggasia-domain-barrel-shape-"));

    const script = `
      import * as barrel from ${JSON.stringify(distIndexUrl)};
      process.stdout.write(JSON.stringify(Object.keys(barrel).sort()));
    `;
    const loaderPath = join(fixtureDir, "loader.mjs");
    writeFileSync(loaderPath, script);

    try {
      const result = spawnSync(process.execPath, [loaderPath], { encoding: "utf-8" });

      expect(result.status).toBe(0);
      const exportedKeys: string[] = JSON.parse(result.stdout);
      // Only `parseExpense` has a runtime footprint -- the three other
      // exports (`ParseResult`, `ParsedExpense`, `RejectedExpense`) are
      // type-only and erased at compile time, so they never appear here.
      expect(exportedKeys).toEqual(["parseExpense"]);
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it("type-only smoke check: ParsedExpense and RejectedExpense are usable from the barrel", () => {
    const okShape: Pick<ParsedExpense, "amount" | "place"> = { amount: 1500, place: "cafe" };
    const rejectedShape: RejectedExpense = { reason: "amount_zero" };

    expect(okShape.amount).toBe(1500);
    expect(rejectedShape.reason).toBe("amount_zero");
  });
});
