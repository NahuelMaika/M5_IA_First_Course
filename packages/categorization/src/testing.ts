/**
 * Test-support entrypoint of `@ggasia/categorization`, separate from the
 * public barrel (`index.ts`, ADR-001). `CATEGORY_KEYWORDS` and
 * `PLURALIZED_KEYWORDS` are normative data kept out of the public API on
 * purpose -- they are not a shared runtime primitive, they are the
 * categorizer's private keyword table. Structural/invariant tests in
 * sibling packages (e.g. `packages/domain/tests/invariant.test.ts`,
 * NFR-06/AC-25) still need to read them to assert the two vocabularies stay
 * disjoint, so this subpath re-exports them explicitly and only for that
 * purpose, consumed through the compiled package (`@ggasia/categorization`
 * /testing) rather than a relative `src/` import -- keeping the "consume
 * compiled" rule intact while avoiding a silent, unreviewed widening of the
 * public barrel.
 */

export { CATEGORY_KEYWORDS } from "./keywords.ts";
export { PLURALIZED_KEYWORDS } from "./pluralize.ts";
