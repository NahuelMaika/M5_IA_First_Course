"use client";

import * as React from "react";
import { Loader2, Mic, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/api/client";
import { useRedirectOnUnauthorized } from "@/lib/auth/use-redirect-on-unauthorized";
import { useAudioRecorder } from "@/lib/hooks/use-audio-recorder";
import { notify } from "@/lib/notifications/notifications";
import { getRejectionMessage, type RejectionReason } from "@/lib/rejection-messages";

import type { CreatedExpense } from "./expense-row";

// RNF-07 (PRD.md): raw input tops at 500 characters, rejected before any interpretation attempt.
const MAX_INPUT_LENGTH = 500;

const EMPTY_ERROR_MESSAGE = "Escribí un gasto antes de guardar.";
const LENGTH_ERROR_MESSAGE = "Máximo 500 caracteres.";
// Block 7: shared by every non-422/non-401 failure path (400/500 and a rejected fetch itself) --
// none of them attempts to read `reason` off the response. 401 no longer falls here -- Block 8
// (spec-FEAT-004b) routes it to `useRedirectOnUnauthorized` instead, since it means the session
// expired or is absent, not a generic failure.
const GENERIC_ERROR_MESSAGE = "Ocurrió un error, intentá de nuevo.";
// Block 7 (spec-FEAT-006): audio-specific messages, distinct from the domain `RejectionReason`s.
const EMPTY_TRANSCRIPTION_MESSAGE =
  "No pudimos reconocer texto en el audio grabado. Probá de nuevo o escribí el gasto.";
const TRANSCRIPTION_FAILED_MESSAGE =
  "No pudimos transcribir el audio. Probá de nuevo o escribí el gasto.";

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

/**
 * Shape of a 201 response body from `POST /expenses` (`apps/api/src/routes/expenses.ts:58-68`).
 * Deliberately has no `id` -- confirmed against that route, which never returns one. Reuses
 * `expense-row.tsx`'s `CreatedExpense` so both this form's own result and `onCreated` share the
 * same single definition instead of two structurally-identical interfaces drifting apart.
 */
type InterpretedExpense = CreatedExpense;

function formatExpenseDate(isoDate: string): string {
  // Fixed locale/timeZone: this is user-facing display, but a floating value here would make the
  // same stored date read differently depending on the visitor's OS settings.
  return new Date(isoDate).toLocaleDateString("es-AR", { timeZone: "UTC" });
}

/**
 * Reads `reason` off a 422 body defensively. `getRejectionMessage` throws for any value outside
 * the 8 mapped `RejectionReason`s (by design, see `rejection-messages.ts`) -- this is the one
 * place that decides what the UI does when that happens: fall back to the generic message rather
 * than let an unmapped reason (e.g. the API adding a 9th one before this file catches up) crash
 * the submit handler.
 */
function resolveRejectionMessage(reason: unknown): string {
  if (typeof reason !== "string") return GENERIC_ERROR_MESSAGE;
  try {
    return getRejectionMessage(reason as RejectionReason);
  } catch {
    return GENERIC_ERROR_MESSAGE;
  }
}

export interface ExpenseFormProps {
  /**
   * Optional hook invoked with the raw input once client-side validation passes, right before
   * the real `POST /expenses` request (wired internally by this component via the Block 5
   * client). Not required for normal use -- available for callers that want to observe
   * submission attempts (e.g. tests).
   */
  onSubmit?: (value: string) => void;
  /**
   * Invoked with the interpreted expense right after a successful (201) creation. Block 9's
   * `page.tsx` wires this to `expense-list.tsx` so a newly created expense is reflected in the
   * list, inserted at its correct `when`-descending position.
   */
  onCreated?: (expense: CreatedExpense) => void;
}

/** Imperative handle exposed via `ref` -- lets a composing screen (Block 9's `page.tsx`) move
 * real focus to this form's textarea, e.g. from `expense-list.tsx`'s empty-state action. */
export interface ExpenseFormHandle {
  focus: () => void;
}

export const ExpenseForm = React.forwardRef<ExpenseFormHandle, ExpenseFormProps>(
  function ExpenseForm({ onSubmit, onCreated }, ref) {
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<InterpretedExpense | null>(null);
  const handleUnauthorized = useRedirectOnUnauthorized();
  const {
    status: recordingStatus,
    errorMessage: recordingErrorMessage,
    start: startRecording,
    stop: stopRecording,
  } = useAudioRecorder();

  React.useImperativeHandle(ref, () => ({
    focus: () => {
      document.getElementById(EXPENSE_INPUT_ID)?.focus();
    },
  }));

  // Block 7 (spec-FEAT-006/AC-08): the hook itself does not call `notify` (kept decoupled from the
  // UI, see use-audio-recorder.ts) -- this is the one place that surfaces a permission-denied or
  // unsupported-browser error once it happens. The text `Textarea` below needs no change to stay
  // operable: it was never disabled by anything related to the recorder.
  React.useEffect(() => {
    if (recordingStatus === "error" && recordingErrorMessage) {
      notify("error", recordingErrorMessage);
    }
  }, [recordingStatus, recordingErrorMessage]);

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

  async function submitExpense(rawInput: string) {
    setIsSubmitting(true);
    try {
      const response = await apiRequest("/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: rawInput }),
      });

      if (response.status === 201) {
        const data = (await response.json()) as InterpretedExpense;
        setResult(data);
        setValue("");
        onCreated?.(data);
        return;
      }

      // Block 8 (spec-FEAT-004b): a 401 means the session expired or is absent while submitting a
      // gasto -- redirect to /login instead of falling into the generic message below, same
      // policy `expense-list.tsx` (Block 7) already applies to its initial load.
      if (handleUnauthorized(response)) return;

      if (response.status === 422) {
        // Only status where the body is parsed: every other failure status below is handled
        // WITHOUT reading the response body at all.
        const body = (await response.json()) as { reason?: unknown };
        notify("error", resolveRejectionMessage(body.reason));
        return;
      }

      // 400/500 (and any other non-201/422/401 status): generic message, body never parsed. 401
      // is handled separately above, see Block 8.
      notify("error", GENERIC_ERROR_MESSAGE);
    } catch {
      // Network failure (fetch itself rejects, no response at all): same treatment as a 500.
      notify("error", GENERIC_ERROR_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  }

  /**
   * Block 7 (spec-FEAT-006): sends a recorded blob to `POST /expenses/audio`. Reuses the same
   * `isSubmitting` flag as `submitExpense` (FR-08/AC-09 -- same visual "Guardando..." pattern,
   * same disabled "Guardar" button) even though this request never touches the `Textarea`'s value.
   * Deliberately does NOT set a `Content-Type` header: the browser must compute the multipart
   * boundary itself from the `FormData` body -- a hardcoded `application/json` (copied from
   * `submitExpense`) would break the upload.
   */
  async function submitAudioExpense(blob: Blob) {
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("file", blob);

      const response = await apiRequest("/expenses/audio", {
        method: "POST",
        body: formData,
      });

      if (response.status === 201) {
        const data = (await response.json()) as InterpretedExpense;
        setResult(data);
        onCreated?.(data);
        return;
      }

      if (handleUnauthorized(response)) return;

      if (response.status === 422) {
        const body = (await response.json()) as { reason?: unknown };
        if (body.reason === "transcripcion_vacia") {
          notify("error", EMPTY_TRANSCRIPTION_MESSAGE);
          return;
        }
        notify("error", resolveRejectionMessage(body.reason));
        return;
      }

      if (response.status === 502) {
        notify("error", TRANSCRIPTION_FAILED_MESSAGE);
        return;
      }

      // 400/413/500 (and any other non-201/422/401/502 status): generic message, body never
      // parsed -- same criterion as `submitExpense`.
      notify("error", GENERIC_ERROR_MESSAGE);
    } catch {
      // Network failure (fetch itself rejects, no response at all): same treatment as a 500.
      notify("error", GENERIC_ERROR_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleMicButtonClick() {
    if (recordingStatus === "recording") {
      const blob = await stopRecording();
      void submitAudioExpense(blob);
      return;
    }
    void startRecording();
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateExpenseInput(value);
    setError(validationError);
    if (validationError !== null) {
      return;
    }
    onSubmit?.(value);
    void submitExpense(value);
  }

  return (
    <div>
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
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              Guardando...
            </>
          ) : (
            "Guardar"
          )}
        </Button>
        {/* Block 7 (spec-FEAT-006/FR-07/AC-06): grabar y enviar son estados independientes --
            este botón nunca se deshabilita por `isSubmitting`, ni mientras graba ni fuera de la
            grabación (por ejemplo mientras el envío de texto está en curso). Va después del botón
            "Guardar" en el DOM para no alterar el orden de tabulación existente. */}
        <Button
          type="button"
          variant={recordingStatus === "recording" ? "destructive" : "outline"}
          onClick={handleMicButtonClick}
        >
          {recordingStatus === "recording" ? (
            <>
              <Square aria-hidden="true" />
              Detener grabación
            </>
          ) : (
            <>
              <Mic aria-hidden="true" />
              Grabar audio
            </>
          )}
        </Button>
      </form>
      {result ? (
        <section
          aria-label="Detalle del gasto guardado"
          className="mt-4 flex flex-col gap-1 rounded-lg border border-border p-4"
        >
          <p className="text-sm text-muted-foreground">{result.name}</p>
          <p className="text-3xl font-bold">
            {result.currency} {result.amount}
          </p>
          <p className="text-sm text-muted-foreground">{result.category}</p>
          <p className="text-sm text-muted-foreground">{formatExpenseDate(result.when)}</p>
        </section>
      ) : null}
    </div>
  );
  }
);
