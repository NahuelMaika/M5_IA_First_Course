import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useFieldValidation } from "./use-field-validation";

const REQUIRED_MESSAGE = "Campo requerido.";

function validateRequired(value: string): string | undefined {
  return value.trim().length === 0 ? REQUIRED_MESSAGE : undefined;
}

describe("useFieldValidation", () => {
  it("shows no error while the field has never lost focus", () => {
    const { result } = renderHook(() => useFieldValidation("", validateRequired));

    expect(result.current.error).toBeUndefined();
    expect(result.current.touched).toBe(false);
  });

  it("shows an error after onBlur with an invalid value", () => {
    const { result } = renderHook(() => useFieldValidation("", validateRequired));

    act(() => {
      result.current.onBlur();
    });

    expect(result.current.touched).toBe(true);
    expect(result.current.error).toBe(REQUIRED_MESSAGE);
  });

  it("hides the error as soon as the value becomes valid, without waiting for a new blur", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useFieldValidation(value, validateRequired),
      { initialProps: { value: "" } }
    );

    act(() => {
      result.current.onBlur();
    });
    expect(result.current.error).toBe(REQUIRED_MESSAGE);

    // No new onBlur is fired here -- only the value prop changes.
    rerender({ value: "algo" });

    expect(result.current.error).toBeUndefined();
  });
});
