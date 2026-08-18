import { describe, expect, it } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

/**
 * Block 1 structural tests for the monorepo bootstrap.
 *
 * This file is named after its primary concern (AC-02 import purity), but
 * also anchors the remaining Block 1 structural contracts that the spec
 * requires and that have no dedicated file of their own in this block:
 * the `main` -> dist wiring, the sequential build:packages chaining, the
 * build-before-test ordering, and the "missing dist throws" error contract.
 *
 * None of these tests mutate the real build artifacts of either workspace:
 * the "missing dist" case is exercised against a throwaway temp fixture
 * instead of the real `dist/` directories, so it cannot race a sibling test
 * asserting `dist/` exists once this block grows a second test file.
 */

const CATEGORIZATION_DIR = resolve(import.meta.dirname, "..");
const DOMAIN_DIR = resolve(import.meta.dirname, "../../domain");
const REPO_ROOT = resolve(import.meta.dirname, "../../..");

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

describe("packages/categorization structural purity (AC-02)", () => {
  it("no source file imports fastify, @prisma/client or anything under apps/", () => {
    const srcDir = join(CATEGORIZATION_DIR, "src");
    const files = collectTsFiles(srcDir);
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const content = readFileSync(file, "utf-8");
      for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
        expect(content).not.toMatch(pattern);
      }
    }
  });
});

describe("workspace bootstrap contract (Block 1)", () => {
  it("both packages' package.json point main at dist/, not src/", () => {
    const domainPkg = JSON.parse(
      readFileSync(join(DOMAIN_DIR, "package.json"), "utf-8"),
    );
    const categorizationPkg = JSON.parse(
      readFileSync(join(CATEGORIZATION_DIR, "package.json"), "utf-8"),
    );

    expect(domainPkg.main).toBe("dist/index.js");
    expect(domainPkg.main).not.toMatch(/src/);
    expect(categorizationPkg.main).toBe("dist/index.js");
    expect(categorizationPkg.main).not.toMatch(/src/);
  });

  it("root test and dev scripts chain build:packages sequentially before anything else", () => {
    const rootPkg = JSON.parse(
      readFileSync(join(REPO_ROOT, "package.json"), "utf-8"),
    );

    expect(rootPkg.scripts.test).toMatch(/^pnpm run build:packages\s*&&/);
    expect(rootPkg.scripts.dev).toMatch(/^pnpm run build:packages\s*&&/);
  });

  it("by the time this suite runs, both packages have already been compiled to dist/ (pnpm test builds before testing, AC-01)", () => {
    expect(existsSync(join(DOMAIN_DIR, "dist", "index.js"))).toBe(true);
    expect(
      existsSync(join(CATEGORIZATION_DIR, "dist", "index.js")),
    ).toBe(true);
  });

  it("dist/index.js is not stale: it is at least as fresh as src/index.ts for both packages", () => {
    const domainDistMtime = statSync(join(DOMAIN_DIR, "dist", "index.js")).mtimeMs;
    const domainSrcMtime = statSync(join(DOMAIN_DIR, "src", "index.ts")).mtimeMs;
    const categorizationDistMtime = statSync(
      join(CATEGORIZATION_DIR, "dist", "index.js"),
    ).mtimeMs;
    const categorizationSrcMtime = statSync(
      join(CATEGORIZATION_DIR, "src", "index.ts"),
    ).mtimeMs;

    expect(domainDistMtime).toBeGreaterThanOrEqual(domainSrcMtime);
    expect(categorizationDistMtime).toBeGreaterThanOrEqual(categorizationSrcMtime);
  });

  // Both tests below build the same throwaway fixture package: a real
  // package.json with an `exports` map (never a hard-coded absolute path),
  // so the assertion actually exercises the `main`/`exports` -> dist wiring
  // this monorepo relies on, and a sibling loader.mjs that imports it by
  // bare specifier. The only variable is whether `dist/index.js` exists.
  //
  // Both are run with `spawnSync(process.execPath, ...)` instead of an
  // in-process dynamic `import()`. Vitest's `import()` resolves through
  // Vite's own resolver, not Node's ESM loader -- the exact interop gap
  // ADR-002 documents ("Vitest no lo detecta, porque resuelve por Vite y no
  // por el loader ESM de Node"). Under Vite, a missing exports target
  // surfaces as Vite's own "Failed to resolve entry" message, and Node's
  // ERR_MODULE_NOT_FOUND never appears -- so a regex that lists it as an
  // alternative is dead code that happens to still pass. Spawning a real
  // `node` child process exercises the resolver ADR-002 is actually about,
  // and lets stderr be asserted on directly instead of guessing at whichever
  // resolver's message wording Vitest routes through.
  function buildFixture(withDist: boolean): { fixtureDir: string; loaderPath: string } {
    const fixtureDir = mkdtempSync(join(tmpdir(), "ggasia-missing-dist-"));
    const fixturePkgDir = join(fixtureDir, "node_modules", "missing-dist-fixture");
    mkdirSync(fixturePkgDir, { recursive: true });
    writeFileSync(
      join(fixturePkgDir, "package.json"),
      JSON.stringify({
        name: "missing-dist-fixture",
        type: "module",
        exports: { ".": "./dist/index.js" },
      }),
    );
    if (withDist) {
      mkdirSync(join(fixturePkgDir, "dist"), { recursive: true });
      writeFileSync(join(fixturePkgDir, "dist", "index.js"), "export {};\n");
    }
    // A sibling entry module inside the same fixture directory: resolving
    // a bare specifier from here walks the real node_modules ancestor chain
    // that Node uses for package resolution, landing on the fixture package
    // above and its exports target.
    const loaderPath = join(fixtureDir, "loader.mjs");
    writeFileSync(loaderPath, 'import "missing-dist-fixture";\n');
    return { fixtureDir, loaderPath };
  }

  it("importing a package whose dist/ does not exist throws, it does not resolve to undefined", () => {
    const { fixtureDir, loaderPath } = buildFixture(false);

    try {
      const result = spawnSync(process.execPath, [loaderPath], { encoding: "utf-8" });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/ERR_MODULE_NOT_FOUND/);
      // Node names the missing entry path itself for a genuinely missing
      // dist/ (this case); it names only the package for the distractor
      // failures (typo'd specifier, missing node_modules, malformed
      // manifest). Asserting the entry path appears rejects those
      // structurally instead of depending on message wording.
      expect(result.stderr).toMatch(/dist[\\/]index\.js/);
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it("importing that same package resolves successfully once dist/index.js exists (positive control)", () => {
    const { fixtureDir, loaderPath } = buildFixture(true);

    try {
      const result = spawnSync(process.execPath, [loaderPath], { encoding: "utf-8" });

      expect(result.status).toBe(0);
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });
});
