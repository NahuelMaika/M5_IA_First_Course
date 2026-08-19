/**
 * Public port of the categorizer (kb.md "Categorización Automática", FR-10).
 *
 * Consumers depend on this interface, never on the concrete implementation
 * in `categorizer.ts` -- `createCategorizer()` is the only way to obtain
 * one, and it returns the interface type, not the class. This is what lets
 * a consumer swap in a test double without touching its own code
 * (AC-14): it only ever holds a `Categorizer`.
 */

import { categorize } from "./categorizer.ts";

export interface Categorizer {
  /**
   * Categorizes a Lugar via deterministic keyword matching. Always returns
   * a category -- never throws, never rejects based on the Lugar's content
   * (see `categorizer.ts`).
   */
  categorize(place: string): string;
}

class KeywordCategorizer implements Categorizer {
  categorize(place: string): string {
    return categorize(place);
  }
}

/** Factory for the default categorizer implementation (FR-10). */
export function createCategorizer(): Categorizer {
  return new KeywordCategorizer();
}
