"use client";

/**
 * Edit dialog for a single expense (Block 11 — spec-FEAT-005a.md).
 *
 * Composes three earlier blocks: `dialog.tsx` (Block 7) for the modal shell, `select.tsx`
 * (Block 9) for the category picker (populated from `GET /categories`, Block 6), and
 * `use-field-validation.ts` (Block 10) for Monto/Lugar/Fecha's inline validation. Preloads the
 * expense's current values and, on submit, calls `PATCH /expenses/:id` (Block 6) with the full
 * edited form (design choice documented below). Closes automatically on success via
 * `onOpenChange(false)` (Block 7's own contract) and reports the API's error through the
 * centralized `notify()` module (AGENTS.md: never call the toast manager directly from a
 * component) on any 4xx/5xx, leaving the dialog open with the user's edits intact (RF-64 of
 * `PRD.md`).
 *
 * Design choice (spec leaves this open — "envía sólo los campos modificados (o todos, según
 * diseño final del form)"): every submit sends all four fields, not a diff. Simpler and
 * deterministic, and the PATCH schema (Block 1) accepts a full body just as well as a partial one.
 */

import * as React from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Select, type SelectOption } from "@/components/ui/select";
import { apiRequest } from "@/lib/api/client";
import { useRedirectOnUnauthorized } from "@/lib/auth/use-redirect-on-unauthorized";
import { useFieldValidation } from "@/lib/hooks/use-field-validation";
import { notify } from "@/lib/notifications/notifications";

import type { CreatedExpense, Expense } from "./expense-row";

const GENERIC_ERROR_MESSAGE = "Ocurrió un error, intentá de nuevo.";

const AMOUNT_FIELD_ID = "expense-edit-amount";
const PLACE_FIELD_ID = "expense-edit-place";
const WHEN_FIELD_ID = "expense-edit-when";

// Same RNF-08 cap as `updateExpenseBodySchema` (apps/api/src/schemas/expense.ts, Block 1).
const MAX_AMOUNT = 999999999.99;

// Ports `hasAtMostTwoDecimals` from `updateExpenseBodySchema` verbatim (same rationale in its own
// comment there: counting decimal digits on the number's string form sidesteps floating-point
// error from a `value * 100` multiplication). `apps/web` does not depend on `@ggasia/domain` or
// `apps/api`'s schemas (confirmed in the impact scan for this ticket), so this validator, and the
// two below, are a deliberate reimplementation, not a shared import.
function hasAtMostTwoDecimals(value: number): boolean {
  const text = value.toString();
  if (text.includes("e") || text.includes("E")) return false;
  const decimalIndex = text.indexOf(".");
  if (decimalIndex === -1) return true;
  return text.length - decimalIndex - 1 <= 2;
}

// Ports `atMidnight`/`retroactivityFloor` from `updateExpenseBodySchema` verbatim -- same
// 12-closed-month window `packages/domain/src/temporal.ts`'s `retroactivityFloor` uses.
function atMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function retroactivityFloor(referenceDate: Date): Date {
  return new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 12, 1);
}

function validateAmount(value: string): string | undefined {
  if (value.trim().length === 0) return "Ingresá un monto.";
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return "Monto inválido.";
  if (numeric <= 0) return "El monto debe ser positivo.";
  if (numeric > MAX_AMOUNT) return "El monto supera el máximo permitido.";
  if (!hasAtMostTwoDecimals(numeric)) return "El monto admite hasta 2 decimales.";
  return undefined;
}

function validatePlace(value: string): string | undefined {
  if (value.length < 1) return "Ingresá un lugar.";
  if (value.length > 200) return "Máximo 200 caracteres.";
  return undefined;
}

function validateWhen(value: string): string | undefined {
  if (value.trim().length === 0) return "Ingresá una fecha.";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Fecha inválida.";
  const referenceDate = new Date();
  if (atMidnight(parsed).getTime() > atMidnight(referenceDate).getTime()) {
    return "La fecha no puede ser futura.";
  }
  if (atMidnight(parsed).getTime() < retroactivityFloor(referenceDate).getTime()) {
    return "La fecha es anterior al piso de retroactividad de 12 meses.";
  }
  return undefined;
}

/** Shape of one item from `GET /categories`'s `categories` array (Block 6). */
interface CategoryDto {
  id: string;
  name: string;
  active: boolean;
}

/** `YYYY-MM-DD`, matching `<input type="date">`'s own value format. Every `when` the API returns
 * is already midnight UTC on its calendar day (`expense-row.tsx`'s `formatExpenseDate` relies on
 * the same property), so slicing the ISO string's first 10 characters is exact, not an
 * approximation. */
function toDateInputValue(isoDate: string): string {
  return isoDate.slice(0, 10);
}

export interface ExpenseEditDialogProps {
  /** The expense being edited. Its current values are what gets preloaded into the form every
   * time the dialog opens (or a different expense is handed in while it's already open). */
  expense: Expense;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Invoked with the updated expense right after a successful (200) PATCH, right before the
   * dialog closes itself. Not required by this block's own tests -- exposed for Block 12's
   * `expense-list.tsx`, which owns reflecting the mutation in the list (RF-68 of `PRD.md`). */
  onUpdated?: (expense: Expense) => void;
}

export function ExpenseEditDialog({
  expense,
  open,
  onOpenChange,
  onUpdated,
}: ExpenseEditDialogProps) {
  const [amount, setAmount] = React.useState(expense.amount);
  const [place, setPlace] = React.useState(expense.place);
  const [whenValue, setWhenValue] = React.useState(() => toDateInputValue(expense.when));
  const [categories, setCategories] = React.useState<CategoryDto[]>([]);
  const [categoryId, setCategoryId] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  // Round 2 correction: same "401 means the session expired or is absent -> redirect to /login"
  // policy `expense-form.tsx` applies (spec-FEAT-004b) -- a generic error message here would trap
  // the user in this dialog with no way to recover.
  const handleUnauthorized = useRedirectOnUnauthorized();

  const amountValidation = useFieldValidation(amount, validateAmount);
  const placeValidation = useFieldValidation(place, validatePlace);
  const whenValidation = useFieldValidation(whenValue, validateWhen);

  // Resets the form fields to the expense's current values every time the dialog opens. Block 12
  // mounts this dialog once at list level and reuses it across rows (per the spec's Logic
  // section), so this cannot rely on mount-time initial state alone.
  React.useEffect(() => {
    if (!open) return;
    setAmount(expense.amount);
    setPlace(expense.place);
    setWhenValue(toDateInputValue(expense.when));
  }, [open, expense]);

  // Loads the category options every time the dialog opens, and preselects the one matching the
  // expense's current category name -- `Expense.category` (the name) is what's persisted, not the
  // id, so the id has to be resolved against `GET /categories`'s response.
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function loadCategories() {
      try {
        const response = await apiRequest("/categories");
        if (cancelled) return;
        if (handleUnauthorized(response)) return;
        if (!response.ok) {
          notify("error", GENERIC_ERROR_MESSAGE);
          return;
        }
        const body = (await response.json()) as { categories: CategoryDto[] };
        if (cancelled) return;
        setCategories(body.categories);
        const match = body.categories.find((category) => category.name === expense.category);
        setCategoryId(match ? match.id : null);
      } catch {
        if (!cancelled) notify("error", GENERIC_ERROR_MESSAGE);
      }
    }

    void loadCategories();
    return () => {
      cancelled = true;
    };
  }, [open, expense, handleUnauthorized]);

  const options: SelectOption[] = categories.map((category) => ({
    value: category.id,
    label: category.name,
  }));

  // Computed from the raw validators (not the touched-gated `.error` above) so the submit button
  // is disabled by actual validity, not by whether the field has been blurred yet.
  const isFormInvalid =
    validateAmount(amount) !== undefined ||
    validatePlace(place) !== undefined ||
    validateWhen(whenValue) !== undefined ||
    categoryId === null;

  async function submitPatch() {
    setIsSubmitting(true);
    try {
      const response = await apiRequest(`/expenses/${expense.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(amount),
          place,
          when: whenValue,
          categoryId,
        }),
      });

      if (response.status === 200) {
        const data = (await response.json()) as CreatedExpense;
        onUpdated?.({ ...data, id: expense.id });
        onOpenChange(false);
        return;
      }

      // Round 2 correction: a 401 means the session expired or is absent -- redirect to /login
      // instead of falling into the generic message below, same policy `expense-form.tsx` applies
      // (spec-FEAT-004b).
      if (handleUnauthorized(response)) return;

      // Every non-200/401 (400/404/422/500, and any other unexpected status): a single generic
      // error notification, dialog stays open with the user's edits intact (RF-64 of `PRD.md`).
      notify("error", GENERIC_ERROR_MESSAGE);
    } catch {
      // Network failure (fetch itself rejects, no response at all): same treatment as a 500.
      notify("error", GENERIC_ERROR_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Reveals every field's error even if the person never blurred it before hitting submit.
    amountValidation.onBlur();
    placeValidation.onBlur();
    whenValidation.onBlur();
    if (isFormInvalid) return;
    void submitPatch();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Editar gasto">
      <form onSubmit={handleSubmit} noValidate className="mt-4 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={AMOUNT_FIELD_ID} className="text-sm font-medium text-foreground">
            Monto
          </label>
          <input
            id={AMOUNT_FIELD_ID}
            name={AMOUNT_FIELD_ID}
            type="number"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            onBlur={amountValidation.onBlur}
            aria-invalid={amountValidation.error !== undefined}
            aria-describedby={
              amountValidation.error !== undefined ? `${AMOUNT_FIELD_ID}-error` : undefined
            }
            className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20"
          />
          {amountValidation.error !== undefined ? (
            <p id={`${AMOUNT_FIELD_ID}-error`} role="alert" className="text-xs text-destructive">
              {amountValidation.error}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={PLACE_FIELD_ID} className="text-sm font-medium text-foreground">
            Lugar
          </label>
          <input
            id={PLACE_FIELD_ID}
            name={PLACE_FIELD_ID}
            type="text"
            value={place}
            onChange={(event) => setPlace(event.target.value)}
            onBlur={placeValidation.onBlur}
            aria-invalid={placeValidation.error !== undefined}
            aria-describedby={
              placeValidation.error !== undefined ? `${PLACE_FIELD_ID}-error` : undefined
            }
            className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20"
          />
          {placeValidation.error !== undefined ? (
            <p id={`${PLACE_FIELD_ID}-error`} role="alert" className="text-xs text-destructive">
              {placeValidation.error}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={WHEN_FIELD_ID} className="text-sm font-medium text-foreground">
            Fecha
          </label>
          <input
            id={WHEN_FIELD_ID}
            name={WHEN_FIELD_ID}
            type="date"
            value={whenValue}
            onChange={(event) => setWhenValue(event.target.value)}
            onBlur={whenValidation.onBlur}
            aria-invalid={whenValidation.error !== undefined}
            aria-describedby={
              whenValidation.error !== undefined ? `${WHEN_FIELD_ID}-error` : undefined
            }
            className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20"
          />
          {whenValidation.error !== undefined ? (
            <p id={`${WHEN_FIELD_ID}-error`} role="alert" className="text-xs text-destructive">
              {whenValidation.error}
            </p>
          ) : null}
        </div>

        <Select label="Categoría" value={categoryId} onValueChange={setCategoryId} options={options} />

        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting || isFormInvalid}>
            {isSubmitting ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                Guardando...
              </>
            ) : (
              "Guardar"
            )}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
