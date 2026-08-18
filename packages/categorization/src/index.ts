/**
 * Public API of `@ggasia/categorization` (ADR-001). Exports the
 * categorizer's port and factory, plus the shared token definition --
 * `tokenize`/`normalize` are here, not in `packages/domain`, because
 * `domain -> categorization` already exists through the port, and the
 * reverse dependency would close a cycle (see ADR-001 for the full
 * reasoning). The keyword table (`keywords.ts`, `pluralize.ts`) stays
 * private: it is normative data, not a shared primitive.
 */

export type { Categorizer } from "./port.ts";
export { createCategorizer } from "./port.ts";
export { normalize } from "./normalize.ts";
export { tokenize } from "./tokenize.ts";
