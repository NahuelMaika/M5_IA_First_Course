import * as React from "react";

/**
 * A pure per-field validator: given the current value, returns an error message, or `undefined`
 * when the value is valid. Contract documented here rather than enforced at runtime (Block 10's
 * "Error handling" section): the function must be pure (no side effects) and must never throw --
 * this hook does not guard against a throwing validator.
 */
export type FieldValidator<T> = (value: T) => string | undefined;

export interface UseFieldValidationResult {
  /** `undefined` while the field is untouched, or while `validator(value)` currently passes. */
  error: string | undefined;
  /** `true` once `onBlur` has fired at least once. */
  touched: boolean;
  /** Wire to the field's `onBlur`. Reveals the error for the first time, if any. */
  onBlur: () => void;
}

/**
 * First extraction of the per-field validation pattern `AGENTS.md` documents ("no hay componente
 * `form`, la validación por campo es un hook") -- until this block, `login-form.tsx`,
 * `register-form.tsx` and `expense-form.tsx` each inlined their own
 * `<field>Error`/`handle<Field>Blur`/`handle<Field>Change` trio doing exactly this.
 *
 * RF-70 (PRD.md): the error stays hidden until the field loses focus for the first time -- never
 * shown while typing the very first value.
 * RF-81 (PRD.md): once touched, the error is derived from the current `value` on every render, so
 * it disappears the moment the value becomes valid again -- no new `onBlur` is required.
 */
export function useFieldValidation<T>(
  value: T,
  validator: FieldValidator<T>
): UseFieldValidationResult {
  const [touched, setTouched] = React.useState(false);

  // Derived, not stored: recomputing on every render (instead of caching the error in state) is
  // what makes RF-81's "hide without waiting for a new blur" work for free -- a value change alone
  // re-renders this hook's owner and re-evaluates `validator(value)`.
  const error = touched ? validator(value) : undefined;

  const onBlur = React.useCallback(() => {
    setTouched(true);
  }, []);

  return { error, touched, onBlur };
}
