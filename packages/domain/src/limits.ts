/**
 * Length caps from kb.md "Largos máximos" (NFR-04). Guards, not product
 * rules -- an input crossing any of these is rejected with `length_exceeded`
 * BEFORE any interpretation is attempted (FR-12, Block 8).
 */

/** Cap on the raw, untouched user input. */
export const MAX_RAW_INPUT_LENGTH = 500;

/** Cap on Lugar. */
export const MAX_PLACE_LENGTH = 200;

/** Cap on Descripción. */
export const MAX_DESCRIPTION_LENGTH = 300;

/** Cap on Nombre -- covers `Lugar - Descripción` in its worst case (200 + 3 + 300). */
export const MAX_NAME_LENGTH = 512;
