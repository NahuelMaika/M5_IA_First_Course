import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Block 10 quality gate (NFR-02, AC-26).
 *
 * `packages/domain` is NOT held to the same "zero runtime dependencies" bar
 * as `packages/categorization` (see that package's `tests/purity.test.ts`):
 * this package consumes the categorizer exclusively through its port
 * (`Categorizer`, from `@ggasia/categorization`), which is a single,
 * documented exception to the "pure" rule -- ADR-001 records why the
 * categorizer's tokenization primitives, and by extension the dependency
 * edge itself, live in `packages/categorization` rather than being
 * duplicated here. Any OTHER third-party runtime dependency would be an
 * undocumented, unreviewed addition, so this test fails on anything beyond
 * that single documented name -- and also fails if `@ggasia/categorization`
 * itself disappears, so the exception cannot silently erode into "actually
 * zero deps" (which would desync this test from the spec's Block 8 design,
 * where the pipeline calls `categorizer.categorize()` directly) without
 * this test being updated deliberately.
 */

const DOMAIN_DIR = resolve(import.meta.dirname, "..");
const ALLOWED_RUNTIME_DEPENDENCIES = ["@ggasia/categorization"];

const FORBIDDEN_IMPORT_PATTERNS = [
  /['"]fastify['"]/,
  /['"]@prisma\/client['"]/,
  /['"][^'"]*\bapps\/[^'"]*['"]/,
];

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

describe("exactly one documented runtime dependency (NFR-02, AC-26, ADR-001)", () => {
  it("package.json declares only @ggasia/categorization as a runtime dependency", () => {
    const pkg = JSON.parse(readFileSync(join(DOMAIN_DIR, "package.json"), "utf-8"));

    const dependencyNames: string[] = pkg.dependencies ? Object.keys(pkg.dependencies) : [];
    const undocumented = dependencyNames.filter(
      (name) => !ALLOWED_RUNTIME_DEPENDENCIES.includes(name),
    );

    expect(
      undocumented,
      `expected no runtime dependencies beyond ${ALLOWED_RUNTIME_DEPENDENCIES.join(", ")}, found: ${undocumented.join(", ")}`,
    ).toEqual([]);
  });

  it("the documented exception (@ggasia/categorization) has not silently disappeared", () => {
    const pkg = JSON.parse(readFileSync(join(DOMAIN_DIR, "package.json"), "utf-8"));

    const dependencyNames: string[] = pkg.dependencies ? Object.keys(pkg.dependencies) : [];

    expect(dependencyNames).toContain("@ggasia/categorization");
  });
});

describe("no Fastify/Prisma/apps imports (structural purity)", () => {
  it("no source file under packages/domain/src imports fastify, @prisma/client or anything under apps/", () => {
    const srcDir = join(DOMAIN_DIR, "src");
    const files = collectTsFiles(srcDir);
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const content = readFileSync(file, "utf-8");
      for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
        expect(content, `${file} matches forbidden pattern ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});
