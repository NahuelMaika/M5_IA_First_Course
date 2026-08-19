import { describe, expect, it } from "vitest";
import type { Categorizer } from "../src/index.ts";
import { createCategorizer, normalize, tokenize } from "../src/index.ts";
import * as publicApi from "../src/index.ts";

/**
 * Block 5 tests for `port.ts`/`index.ts` (kb.md "Categorización
 * Automática", FR-10, ADR-001, AC-14).
 */

describe("Categorizer port", () => {
  it("a consumer imports the port from the package's public entry point and categorizes a real Lugar (AC-14)", () => {
    const categorizer: Categorizer = createCategorizer();
    expect(categorizer.categorize("supermercado coto")).toBe("Comida");
  });

  it("a consumer substitutes the implementation for a double implementing the port, without changing its own code (AC-14)", () => {
    // Simulated consumer: only ever depends on the `Categorizer` interface,
    // never on `createCategorizer()` or the concrete class. Reused
    // unmodified below with a test double, proving the port is a
    // substitutable dependency-injection seam, not just a mockable module.
    function summarize(categorizer: Categorizer, place: string): string {
      return `Lugar categorized as: ${categorizer.categorize(place)}`;
    }

    const realCategorizer = createCategorizer();
    expect(summarize(realCategorizer, "farmacia del sol")).toBe(
      "Lugar categorized as: Salud",
    );

    const doubleCategorizer: Categorizer = {
      categorize: (_place: string) => "Doble",
    };
    expect(summarize(doubleCategorizer, "cualquier cosa")).toBe(
      "Lugar categorized as: Doble",
    );
  });

  it("exports exactly the port, the factory, resolveCategoryName, tokenize and normalize -- no keyword table (ADR-001, ADR-004)", () => {
    const exportedNames = Object.keys(publicApi);

    expect(exportedNames.sort()).toEqual(
      ["createCategorizer", "normalize", "resolveCategoryName", "tokenize"].sort(),
    );
    expect(exportedNames).not.toContain("CATEGORY_KEYWORDS");
    expect(exportedNames).not.toContain("PLURALIZED_KEYWORDS");
    expect(
      exportedNames.some((name) => /keyword/i.test(name)),
    ).toBe(false);

    // `Categorizer` is a type-only export -- it has no runtime presence to
    // assert on `publicApi`, but `createCategorizer(): Categorizer` above
    // already proves it is importable from this same entry point.
    expect(typeof createCategorizer).toBe("function");
    expect(typeof tokenize).toBe("function");
    expect(typeof normalize).toBe("function");
  });

  it("categorize() never leaks the input Lugar in its return value (scope note below)", () => {
    // Block 5's only port method is `categorize`, which by Block 4's design
    // (categorizer.ts) always returns a plain category string and never
    // throws or returns a rejection object -- there is no "rejection with
    // reason" concept at this port yet. That full obligation (motivo
    // distinguible por regla, never the input text) belongs to Block 6's
    // `category-name.ts`, which resolves the marked category name and does
    // not exist yet. This test covers what DOES exist now: proof by
    // construction that an unrecognizable marker Lugar never reappears in
    // the returned category, whether or not it matches a keyword.
    const marker = "MARCADOR_UNICO_XYZ_12345";
    const categorizer = createCategorizer();
    const knownCategories = [
      "Comida",
      "Transporte",
      "Entretenimiento",
      "Servicios",
      "Salud",
      "Alquiler",
      "Indumentaria",
      "Hogar",
      "Cuidado personal",
      "Mascotas",
      "Otros",
    ];

    const result = categorizer.categorize(marker);

    expect(result).not.toContain(marker);
    expect(knownCategories).toContain(result);
  });
});
