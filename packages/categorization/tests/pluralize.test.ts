import { describe, expect, it } from "vitest";
import { CATEGORY_KEYWORDS } from "../src/keywords.ts";
import { normalize } from "../src/normalize.ts";
import {
  INVARIANT_KEYWORDS,
  PLURALIZED_KEYWORDS,
  REVERSE_PLURAL_KEYWORDS,
} from "../src/pluralize.ts";

/**
 * Block 3 tests for `pluralize.ts` (kb.md "Reglas de coincidencia" rule 3,
 * lines 336-358; mitigations R-02, R-04).
 */

/**
 * This helper applies the SAME mechanical rule as `pluralizeToken`
 * (same branch order, same `/[aeiou]$/` check, same `slice(0,-1)+"ces"`).
 * It does not validate the rule's correctness independently -- a bug baked
 * into the rule itself would pass on both sides identically. What it DOES
 * validate is the wiring around the rule: that `pluralize.ts` applies it
 * per-token (not per-keyword-string), that multi-token keywords pluralize
 * every token, and that invariant/reverse-singular keywords are routed to
 * the OTHER branches instead of through this one.
 */
function expectedRegularPlural(token: string): string {
  if (token.endsWith("z")) {
    return `${token.slice(0, -1)}ces`;
  }
  if (/[aeiou]$/.test(token)) {
    return `${token}s`;
  }
  return `${token}es`;
}

/** Joins a tokenized form back into a space-separated string for assertions. */
function formsAsStrings(forms: readonly (readonly string[])[]): string[] {
  return forms.map((form) => form.join(" "));
}

describe("pluralize: structural walk over all 258 keywords (AC-15, NFR-04)", () => {
  const allEntries = CATEGORY_KEYWORDS.flatMap(({ category, keywords }) =>
    keywords.map((keyword) => ({ category, keyword })),
  );

  it("covers exactly 258 keywords", () => {
    expect(allEntries.length).toBe(258);
  });

  it("produces the plural (or invariant / reverse-singular) form the rules dictate, for every keyword", () => {
    for (const { category, keyword } of allEntries) {
      const normalizedKeyword = normalize(keyword);
      const entry = PLURALIZED_KEYWORDS.find(
        (e) => e.category === category && e.keyword === normalizedKeyword,
      );
      expect(entry, `missing table entry for "${keyword}" (${category})`).toBeDefined();

      const tokens = normalizedKeyword.split(" ");
      const isInvariant = tokens.some((t) => INVARIANT_KEYWORDS.has(t));
      const reverseSingular = REVERSE_PLURAL_KEYWORDS.get(normalizedKeyword);

      const actualForms = formsAsStrings(entry!.forms).sort();

      if (reverseSingular !== undefined) {
        expect(actualForms).toEqual([normalizedKeyword, reverseSingular].sort());
      } else if (isInvariant) {
        expect(actualForms).toEqual([normalizedKeyword]);
      } else {
        const expectedPlural = tokens.map(expectedRegularPlural).join(" ");
        expect(actualForms).toEqual([normalizedKeyword, expectedPlural].sort());
      }
    }
  });

  it("stores every form pre-tokenized -- no space-joined strings", () => {
    for (const entry of PLURALIZED_KEYWORDS) {
      for (const form of entry.forms) {
        expect(Array.isArray(form)).toBe(true);
        for (const token of form) {
          expect(token.includes(" ")).toBe(false);
        }
      }
    }
  });
});

describe("pluralize: no cross-category collisions after pluralization (AC-15)", () => {
  it("never maps the same matching form to two different categories", () => {
    const formToCategory = new Map<string, string>();
    const collisions: string[] = [];

    for (const entry of PLURALIZED_KEYWORDS) {
      for (const form of entry.forms) {
        const key = form.join(" ");
        const existingCategory = formToCategory.get(key);
        if (existingCategory !== undefined && existingCategory !== entry.category) {
          collisions.push(
            `"${key}" matches both "${existingCategory}" and "${entry.category}"`,
          );
        } else {
          formToCategory.set(key, entry.category);
        }
      }
    }

    expect(collisions).toEqual([]);
  });
});

describe("pluralize: regular plurals resolve to the right category (AC-06)", () => {
  it("farmacias -> Salud", () => {
    const entry = PLURALIZED_KEYWORDS.find((e) =>
      formsAsStrings(e.forms).includes("farmacias"),
    );
    expect(entry?.category).toBe("Salud");
  });

  it("luces -> Servicios", () => {
    const entry = PLURALIZED_KEYWORDS.find((e) =>
      formsAsStrings(e.forms).includes("luces"),
    );
    expect(entry?.category).toBe("Servicios");
  });

  it("bares -> Entretenimiento", () => {
    const entry = PLURALIZED_KEYWORDS.find((e) =>
      formsAsStrings(e.forms).includes("bares"),
    );
    expect(entry?.category).toBe("Entretenimiento");
  });

  it("obras sociales -> Salud (multi-token keyword pluralizes every token)", () => {
    const entry = PLURALIZED_KEYWORDS.find((e) =>
      formsAsStrings(e.forms).includes("obras sociales"),
    );
    expect(entry?.category).toBe("Salud");
    expect(entry?.forms.find((f) => f.join(" ") === "obras sociales")).toEqual([
      "obras",
      "sociales",
    ]);
  });
});

describe("pluralize: invariants do not take a plural (AC-07)", () => {
  it("netflix matches, netflixes does not", () => {
    const netflixEntry = PLURALIZED_KEYWORDS.find((e) => e.keyword === "netflix");

    expect(netflixEntry).toBeDefined();
    expect(formsAsStrings(netflixEntry!.forms)).toContain("netflix");
    expect(formsAsStrings(netflixEntry!.forms)).not.toContain("netflixes");

    const anyEntryMatchingNetflixes = PLURALIZED_KEYWORDS.find((e) =>
      formsAsStrings(e.forms).includes("netflixes"),
    );
    expect(anyEntryMatchingNetflixes).toBeUndefined();
  });
});

describe("pluralize: precomputed once at module load, not per access (mitigation R-02)", () => {
  it("returns the exact same array reference on repeated access", () => {
    const first = PLURALIZED_KEYWORDS;
    const second = PLURALIZED_KEYWORDS;
    expect(first).toBe(second);
  });

  it("keeps the same reference across a fresh module import", async () => {
    const reimported = await import("../src/pluralize.ts");
    expect(reimported.PLURALIZED_KEYWORDS).toBe(PLURALIZED_KEYWORDS);
  });
});

describe("pluralize: reverse case -- already-plural entries match their singular (kb.md:347-348)", () => {
  it("expensa matches the expensas entry", () => {
    const entry = PLURALIZED_KEYWORDS.find((e) =>
      formsAsStrings(e.forms).includes("expensa"),
    );
    expect(entry?.keyword).toBe("expensas");
    expect(entry?.category).toBe("Alquiler");
  });

  it("anteojo matches the anteojos entry", () => {
    const entry = PLURALIZED_KEYWORDS.find((e) =>
      formsAsStrings(e.forms).includes("anteojo"),
    );
    expect(entry?.keyword).toBe("anteojos");
    expect(entry?.category).toBe("Salud");
  });
});
