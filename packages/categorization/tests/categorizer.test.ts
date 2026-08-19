import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { categorize, UNCATEGORIZED } from "../src/categorizer.ts";

/**
 * Block 4 tests for `categorizer.ts` (kb.md "Categorización Automática",
 * FR-05/FR-07/FR-08, AC-05/AC-08/AC-09).
 */

describe("categorize", () => {
  it("breaks ties by normative order: 'super y farmacia' -> Comida (AC-05)", () => {
    // 'super' (Comida) is reachable before 'farmacia' (Salud) is even
    // considered -- Comida wins even though 'farmacia' also matches.
    expect(categorize("super y farmacia")).toBe("Comida");
  });

  it("breaks ties by normative order: 'comida para perro' -> Mascotas (AC-05)", () => {
    // 'comida' is not itself a keyword of any category; 'perro' (Mascotas)
    // is the only token that matches.
    expect(categorize("comida para perro")).toBe("Mascotas");
  });

  it("matches a multi-token keyword only as a contiguous window: 'obra social swiss medical' -> Salud (AC-08)", () => {
    expect(categorize("obra social swiss medical")).toBe("Salud");
  });

  it("does not match the same tokens when separated (AC-08)", () => {
    expect(categorize("obra de la social")).toBe(UNCATEGORIZED);
  });

  it("does not match the same tokens when inverted (AC-08)", () => {
    expect(categorize("social obra")).toBe(UNCATEGORIZED);
  });

  it("returns Otros when no keyword matches, without any external call (AC-09, NFR-03)", () => {
    expect(categorize("comida 5000")).toBe(UNCATEGORIZED);
  });

  it("returns Otros for an empty Lugar", () => {
    expect(categorize("")).toBe(UNCATEGORIZED);
  });

  it("never throws regardless of Lugar content", () => {
    expect(() => categorize("   ")).not.toThrow();
    expect(() => categorize("!!!###$$$")).not.toThrow();
    expect(() => categorize("a".repeat(500))).not.toThrow();
  });
});

describe("categorizer.ts structural contract", () => {
  const source = readFileSync(
    resolve(import.meta.dirname, "../src/categorizer.ts"),
    "utf-8",
  );

  it("contains no console.* call", () => {
    expect(source).not.toMatch(/console\./);
  });

  it("contains no logger usage", () => {
    expect(source).not.toMatch(/logger/i);
  });

  it("makes no network call (no fetch/http/https reference)", () => {
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/require\(["']https?["']\)/);
    expect(source).not.toMatch(/from\s+["']node:https?["']/);
  });
});
