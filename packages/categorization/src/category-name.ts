/**
 * Resolution of a marked category name (kb.md "Categoria", lines 181-199;
 * spec-FEAT-001a Block 6). Whoever extracts the marker `#nombre` from the
 * raw input is FEAT-001b's job -- this module only receives the already
 * extracted `string` and decides what it resolves to.
 *
 * Uses the SAME `normalize()` as Block 2 (kb.md:186-189: "es obligatorio que
 * sea la misma") -- reimplementing lowercase/accent/whitespace handling here
 * would be exactly the drift kb.md forbids.
 */

import { normalize } from "./normalize.ts";

const MAX_RAW_LENGTH = 60;

/** A currently visible category, active or deactivated (soft-deleted). */
export interface VisibleCategory {
  name: string;
  active: boolean;
}

/**
 * Three distinguishable outcomes (FR-09), discriminated by `outcome` --
 * never by inspecting a free-form string. Rejections never carry the input
 * text: the marked name is potential PII (kb.md, threat-FEAT-001a R-?? PII
 * note).
 */
export type CategoryNameResolution =
  | { outcome: "resolved"; category: string }
  | { outcome: "must_create"; reason: "no_match" | "deactivated_match" }
  | { outcome: "rejected"; reason: "too_long" | "empty" };

/**
 * Resolves a marked category name against the categories currently visible
 * to the user (active + deactivated -- both are needed to tell "must_create"
 * apart from "must_create a new one because the match was deactivated").
 */
export function resolveCategoryName(
  markedName: string,
  visibleCategories: readonly VisibleCategory[],
): CategoryNameResolution {
  // R-08: the 60-char cap is measured on the RAW string, before normalize().
  // Normalizing first would make an oversized input pay for normalization
  // before being rejected.
  if (markedName.length > MAX_RAW_LENGTH) {
    return { outcome: "rejected", reason: "too_long" };
  }

  const normalizedName = normalize(markedName);
  if (normalizedName === "") {
    return { outcome: "rejected", reason: "empty" };
  }

  // R-05: never index with an object literal (`{}`) -- a key like
  // `__proto__` or `constructor` would resolve to something truthy
  // inherited from Object.prototype instead of "no match". Map has no
  // prototype-chain lookup fallback.
  const activeByName = new Map<string, VisibleCategory>();
  const deactivatedByName = new Map<string, VisibleCategory>();
  for (const category of visibleCategories) {
    const key = normalize(category.name);
    if (category.active) {
      activeByName.set(key, category);
    } else {
      deactivatedByName.set(key, category);
    }
  }

  const activeMatch = activeByName.get(normalizedName);
  if (activeMatch !== undefined) {
    return { outcome: "resolved", category: activeMatch.name };
  }

  // A name matching only a deactivated category still must_create (a soft
  // delete frees the name for reuse, kb.md:192-194) -- the deactivated
  // category is read here, never mutated or reactivated. AC-11 vs AC-12
  // (PRD) require the two paths to carry distinguishable reasons, so the
  // caller can tell "brand new name" apart from "name reused after a
  // deactivation" without re-resolving.
  const reason = deactivatedByName.has(normalizedName) ? "deactivated_match" : "no_match";
  return { outcome: "must_create", reason };
}
