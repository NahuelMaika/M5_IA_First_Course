import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalize } from "../src/normalize.ts";

/**
 * Block 2 tests for `normalize` (FR-03, AC-03, mitigation R-03).
 */

describe("normalize", () => {
  it("makes uppercase, accents and repeated spaces equivalent (AC-03)", () => {
    expect(normalize("Almacen")).toBe(normalize("almacén"));
    expect(normalize("Médico")).toBe(normalize("medico"));
    expect(normalize("café   con   leche")).toBe(normalize("Café con leche"));
  });

  it("does not mutate or alter the original text it receives (FR-03)", () => {
    const original = "Médico  García";
    const originalCopy = original.slice();

    normalize(original);

    expect(original).toBe(originalCopy);
  });

  it("returns a new value distinct from a differently-cased/accented input", () => {
    const original = "Médico";
    const result = normalize(original);

    expect(result).not.toBe(original);
    expect(result).toBe("medico");
  });
});

describe("normalize structural (no logging of the input)", () => {
  it("contains no console/logger calls or stdout writes", () => {
    const filePath = resolve(import.meta.dirname, "../src/normalize.ts");
    const content = readFileSync(filePath, "utf-8");

    expect(content).not.toMatch(/console\./);
    expect(content).not.toMatch(/logger/i);
    expect(content).not.toMatch(/process\.stdout/);
  });
});
