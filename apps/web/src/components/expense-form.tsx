"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

// RNF-07 (PRD.md): raw input tops at 500 characters, rejected before any interpretation attempt.
const MAX_INPUT_LENGTH = 500;

const EMPTY_ERROR_MESSAGE = "Escribí un gasto antes de guardar.";
const LENGTH_ERROR_MESSAGE = "Máximo 500 caracteres.";

const EXPENSE_INPUT_ID = "expense-input";
const EXPENSE_INPUT_ERROR_ID = "expense-input-error";

function validateExpenseInput(value: string): string | null {
  if (value.trim().length === 0) {
    return EMPTY_ERROR_MESSAGE;
  }
  if (value.length > MAX_INPUT_LENGTH) {
    return LENGTH_ERROR_MESSAGE;
  }
  return null;
}

export interface ExpenseFormProps {
  /**
   * Extension point for Block 7: called with the raw input once client-side validation
   * passes. This block never invokes the API itself -- no `fetch` call happens here.
   */
  onSubmit?: (value: string) => void;
}

export function ExpenseForm({ onSubmit }: ExpenseFormProps) {
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const hasError = error !== null;

  function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    const nextValue = event.target.value;
    setValue(nextValue);
    // RF-81: hide an already-visible error the moment the value becomes valid again --
    // no need to wait for a new blur or submit attempt.
    if (error !== null && validateExpenseInput(nextValue) === null) {
      setError(null);
    }
  }

  function handleBlur() {
    // RF-70: reveal the error on blur or submit only, never while typing the first character.
    setError(validateExpenseInput(value));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateExpenseInput(value);
    setError(validationError);
    if (validationError !== null) {
      return;
    }
    onSubmit?.(value);
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <label htmlFor={EXPENSE_INPUT_ID}>Describí tu gasto</label>
      <Textarea
        id={EXPENSE_INPUT_ID}
        name={EXPENSE_INPUT_ID}
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        aria-invalid={hasError}
        aria-describedby={hasError ? EXPENSE_INPUT_ERROR_ID : undefined}
      />
      <span aria-hidden="true">
        {value.length}/{MAX_INPUT_LENGTH}
      </span>
      {hasError ? (
        <p id={EXPENSE_INPUT_ERROR_ID} role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit">Guardar</Button>
    </form>
  );
}
