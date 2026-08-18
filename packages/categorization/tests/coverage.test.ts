import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Block 7 quality gates (NFR-01, NFR-02, NFR-03, AC-16).
 *
 * The real coverage gate lives in `vitest.config.ts`'s `coverage.thresholds`
 * -- Vitest fails the run itself when a metric dips below 90%, which is not
 * something a test body can observe or re-assert at runtime (the resolved
 * coverage config isn't exposed to test code). The test below anchors that
 * the thresholds are declared at all, so a future edit that silently drops
 * or lowers them fails this suite instead of only being caught the next
 * time someone happens to run `--coverage` and reads the summary by eye.
 */

const CATEGORIZATION_DIR = resolve(import.meta.dirname, "..");

function collectTsFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;

    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

describe("coverage thresholds are configured to fail the suite (NFR-01, AC-16)", () => {
  it("vitest.config.ts declares lines/branches/functions thresholds >= 90", () => {
    const configSource = readFileSync(
      join(CATEGORIZATION_DIR, "vitest.config.ts"),
      "utf-8",
    );

    // Vitest doesn't expose its resolved config to a running test, so this
    // parses the source directly -- the gate that actually fails the run
    // lives in the config, this only guards against it regressing unnoticed.
    const thresholdsBlock = configSource.match(/thresholds:\s*\{([^}]*)\}/);
    expect(thresholdsBlock, "vitest.config.ts must declare coverage.thresholds").not.toBeNull();

    const block = thresholdsBlock![1];
    for (const metric of ["lines", "branches", "functions"] as const) {
      const match = block.match(new RegExp(`${metric}:\\s*(\\d+)`));
      expect(match, `thresholds.${metric} must be set`).not.toBeNull();
      expect(Number(match![1])).toBeGreaterThanOrEqual(90);
    }
  });
});

describe("zero third-party runtime dependencies (NFR-02, AC-16)", () => {
  it("package.json declares no runtime dependencies", () => {
    const pkg = JSON.parse(
      readFileSync(join(CATEGORIZATION_DIR, "package.json"), "utf-8"),
    );

    const dependencyNames = pkg.dependencies ? Object.keys(pkg.dependencies) : [];
    expect(
      dependencyNames,
      `expected 0 runtime dependencies, found: ${dependencyNames.join(", ")}`,
    ).toHaveLength(0);
  });
});

describe("no network or LLM SDK imports (NFR-03)", () => {
  const FORBIDDEN_PATTERNS = [
    /['"]node:http['"]/,
    /['"]node:https['"]/,
    /['"]http['"]/,
    /['"]https['"]/,
    /\bfetch\s*\(/,
    /['"]openai['"]/,
    /['"]@anthropic-ai\/sdk['"]/,
    /['"]@google\/generative-ai['"]/,
    /['"]langchain['"]/,
  ];

  it("no source file imports network primitives or a known LLM SDK", () => {
    const srcDir = join(CATEGORIZATION_DIR, "src");
    const files = collectTsFiles(srcDir);
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const content = readFileSync(file, "utf-8");
      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(content, `${file} matches forbidden pattern ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});
