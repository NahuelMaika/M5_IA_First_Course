import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.ts"],
      // NFR-06: keeps performance.test.ts out of the coverage *report*.
      // This alone does NOT stop V8 from instrumenting the process while
      // performance.test.ts runs -- `coverage.include`/`exclude` only
      // filter what gets reported, not what gets profiled. The actual
      // isolation from instrumentation happens at the script level (see
      // package.json's `test` script): performance.test.ts is excluded
      // from the `--coverage` run entirely and executed in a separate,
      // uninstrumented `vitest run` afterwards.
      exclude: ["tests/performance.test.ts"],
      // NFR-01/AC-16: fail the suite, not just report, below 90%.
      thresholds: {
        lines: 90,
        branches: 90,
        functions: 90,
      },
    },
  },
});
