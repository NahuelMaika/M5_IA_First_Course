/**
 * Spanish messages for every `reason` a 422 response from `POST /expenses` can carry
 * (Block 7 — spec-FEAT-003b).
 *
 * `RejectionReason` mirrors `packages/domain/src/types.ts`'s union of the same name. It is
 * duplicated here rather than imported: `apps/web` has no dependency on `@ggasia/domain` (that
 * package is consumed compiled by `apps/api` only, per AGENTS.md's "packages/domain ... never
 * import[s] Fastify, Prisma or anything from apps/"), and pulling in a whole workspace package
 * for one eight-value string union would be a heavier dependency than this block needs. If the
 * domain union changes, this file's `RejectionReason` and `REJECTION_MESSAGES` must be updated to
 * match by hand.
 *
 * `getRejectionMessage` has NO `default`/fallback branch: `REJECTION_MESSAGES` is typed as
 * `Record<RejectionReason, string>`, so the object literal itself fails to compile if a case is
 * missing (compile-time exhaustiveness). The `reason in REJECTION_MESSAGES` guard below additionally
 * protects the one place this type safety cannot reach: `reason` on the wire is untyped JSON from
 * an HTTP response, not a value TypeScript verified — an unmapped string reaching this function at
 * runtime (e.g. the API adds a 9th reason before this file is updated) throws instead of silently
 * returning a generic message.
 */
export type RejectionReason =
  | "empty_left_segment"
  | "amount_indeterminate"
  | "amount_malformed"
  | "amount_zero"
  | "empty_place"
  | "future_date"
  | "date_out_of_window"
  | "length_exceeded";

const REJECTION_MESSAGES: Record<RejectionReason, string> = {
  empty_left_segment: "No encontramos un lugar antes del \" - \". Revisá el texto del gasto.",
  amount_indeterminate:
    "No pudimos identificar un monto único. Marcá el monto con \"$\" si hay más de un número.",
  amount_malformed:
    "El monto tiene un formato inválido. Revisá los separadores de miles y decimales.",
  amount_zero: "El monto no puede ser $0.",
  empty_place: "No encontramos un lugar en el texto. Indicá dónde fue el gasto.",
  future_date: "La fecha no puede ser futura.",
  date_out_of_window: "La fecha es demasiado antigua. Ingresá una fecha de los últimos 12 meses.",
  length_exceeded: "El texto es demasiado largo.",
};

/**
 * Maps a `RejectionReason` to its Spanish message. Throws — never falls back to a generic
 * message — when `reason` is not one of the 8 mapped values.
 */
export function getRejectionMessage(reason: RejectionReason): string {
  if (!(reason in REJECTION_MESSAGES)) {
    throw new Error(`Unmapped rejection reason: ${String(reason)}`);
  }
  return REJECTION_MESSAGES[reason];
}
