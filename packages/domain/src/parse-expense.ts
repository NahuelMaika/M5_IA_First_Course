/**
 * Orchestrates the six pipeline stages of kb.md's "Extracción de Campos
 * desde Texto Libre" into a single entry point (spec-FEAT-001b Block 8,
 * FR-08, FR-09, FR-10, FR-12, FR-13). This is the ONLY module that knows the
 * full, fixed order of the pipeline -- every stage it calls (Blocks 2-7)
 * stays blind to the others, exactly as designed.
 *
 * Fixed order (kb.md): split Descripción -> temporal reference -> category
 * marker -> word numerals -> Monto -> filler-word discard (Lugar). Any
 * rejection along the way stops the pipeline immediately, with no side
 * effect and no leaked information about a stage that ran before the
 * rejection (FR-13, AC-24) -- `RejectedExpense` structurally carries nothing
 * but `reason` (see `types.ts`), so this is enforced by the type, not by
 * runtime discipline alone.
 */

import { tokenize } from "@ggasia/categorization";
import type { Categorizer } from "@ggasia/categorization";
import { splitDescription } from "./separator.ts";
import { extractTemporalReference, resolveWhen } from "./temporal.ts";
import { extractCategoryMarker } from "./category-marker.ts";
import { convertWordNumerals } from "./numerals.ts";
import { determineAmount } from "./amount.ts";
import { stripFillerWords } from "./filler-words.ts";
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_NAME_LENGTH,
  MAX_PLACE_LENGTH,
  MAX_RAW_INPUT_LENGTH,
} from "./limits.ts";
import type { ParseResult, RejectionReason } from "./types.ts";

function reject(reason: RejectionReason): ParseResult {
  return { ok: false, rejection: { reason } };
}

/**
 * Interprets one raw expense sentence into a `ParsedExpense`, or a typed
 * `RejectedExpense`, following kb.md's fixed six-stage order. Never throws
 * on malformed input (threat boundary B1) -- every rejection path returns a
 * typed result.
 */
export function parseExpense(
  raw: string,
  referenceDate: Date,
  categorizer: Categorizer,
): ParseResult {
  // Step 1 (FR-12): raw-input length cap, evaluated BEFORE any interpretation.
  if (raw.length > MAX_RAW_INPUT_LENGTH) {
    return reject("length_exceeded");
  }

  // Step 2: Paso 0 -- cut Descripción off the raw input.
  const { left, description } = splitDescription(raw);

  // Step 3: an empty left segment has neither Monto nor Lugar to extract.
  if (left.length === 0) {
    return reject("empty_left_segment");
  }

  // Step 4: tokenize the left segment only -- Descripción is never interpreted.
  const leftTokens = tokenize(left);

  // Step 5: temporal reference, removed before Monto so a date's digits
  // never get confused with the amount.
  const temporalExtraction = extractTemporalReference(leftTokens, referenceDate);
  const resolvedWhen = resolveWhen(temporalExtraction.when, referenceDate);
  if (typeof resolvedWhen === "string") {
    return reject(resolvedWhen);
  }
  const when = resolvedWhen;

  // Step 6: category marker, removed before numerals/Monto.
  const markerExtraction = extractCategoryMarker(temporalExtraction.remainingTokens);

  // Step 7: word-form numerals to digits, before Monto is determined.
  const numeralTokens = convertWordNumerals(markerExtraction.remainingTokens);

  // Step 8: Monto, over every remaining number token.
  const amountResult = determineAmount(numeralTokens);
  if ("rejection" in amountResult) {
    return reject(amountResult.rejection);
  }
  const { amount, consumedTokens } = amountResult;

  // Step 9: Lugar -- what's left after removing Monto's own token(s) and
  // discarding filler words (kb.md: "lo que queda... después de quitar el
  // monto, las palabras de fecha... el marcador... y las muletillas").
  // `consumedTokens` comes straight from `determineAmount` -- no re-deriving
  // which tokens formed the Monto.
  const { start, end } = consumedTokens;
  const tokensWithoutAmount = [...numeralTokens.slice(0, start), ...numeralTokens.slice(end)];
  const placeTokens = stripFillerWords(tokensWithoutAmount);
  const place = placeTokens.join(" ");

  if (place.length === 0) {
    return reject("empty_place");
  }

  if (description.length > MAX_DESCRIPTION_LENGTH || place.length > MAX_PLACE_LENGTH) {
    return reject("length_exceeded");
  }

  // Step 10/FR-08: Nombre defaults to Lugar, or "Lugar - Descripción".
  const name = description.length === 0 ? place : `${place} - ${description}`;

  if (name.length > MAX_NAME_LENGTH) {
    return reject("length_exceeded");
  }

  // FR-10/AC-17: a marker's raw name wins, unresolved; otherwise the
  // injected categorizer port decides, exclusively from Lugar.
  const { category, categoryOrigin } =
    markerExtraction.markedName !== null
      ? { category: markerExtraction.markedName, categoryOrigin: "marcador" as const }
      : { category: categorizer.categorize(place), categoryOrigin: "automatica" as const };

  return {
    ok: true,
    expense: {
      amount,
      place,
      when,
      category,
      categoryOrigin,
      description,
      name,
      type: "Personal", // FR-09: default, no other value exists yet
    },
  };
}
