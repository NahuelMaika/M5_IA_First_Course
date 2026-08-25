"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/api/client";
import { useRedirectOnUnauthorized } from "@/lib/auth/use-redirect-on-unauthorized";
import { notify } from "@/lib/notifications/notifications";

import { ExpenseEditDialog } from "./expense-edit-dialog";
import { ExpenseRow, type CreatedExpense, type Expense } from "./expense-row";

// Block 8 (spec-FEAT-003b): shared with the load-error inline state -- kept as a plain string,
// not read from the response body. 500/network still collapse into this generic message; 401 no
// longer does -- Block 7 (spec-FEAT-004b) routes it to `useRedirectOnUnauthorized` instead, since
// it means the session expired or is absent, not a generic failure. Block 12 (spec-FEAT-005a.md)
// reuses the same generic message for a failed `DELETE`.
const GENERIC_ERROR_MESSAGE = "Ocurrió un error, intentá de nuevo.";
const EMPTY_STATE_MESSAGE = "Todavía no cargaste ningún gasto. Empezá agregando el primero.";
// Block 12 (spec-FEAT-005a.md), RF-80 of PRD.md: brief success notification for edit/delete,
// through the same centralized `notify()` module as every other screen (AGENTS.md).
const EXPENSE_UPDATED_MESSAGE = "Gasto actualizado.";
const EXPENSE_DELETED_MESSAGE = "Gasto eliminado.";

interface ExpensesResponse {
  expenses: Expense[];
}

/**
 * Inserts `created` into `expenses` at the position that keeps the list `when`-descending, NOT
 * always at the top (Block 9 -- PRD loop 1: `GET /expenses` orders by the expense's own date, not
 * by load time, so an expense entered today with an older `when` lands among expenses from that
 * date, not above everything else). Assigns a temporary local id via `crypto.randomUUID()` purely
 * for the React key -- the next full load replaces it with the server's real id; this has no
 * bearing on any business logic.
 */
function insertExpenseByWhenDescending(expenses: Expense[], created: CreatedExpense): Expense[] {
  const expenseWithTempId: Expense = { ...created, id: crypto.randomUUID() };
  const insertIndex = expenses.findIndex((expense) => expense.when < expenseWithTempId.when);
  if (insertIndex === -1) {
    return [...expenses, expenseWithTempId];
  }
  return [
    ...expenses.slice(0, insertIndex),
    expenseWithTempId,
    ...expenses.slice(insertIndex),
  ];
}

type ListState =
  | { status: "loading" }
  | { status: "success"; expenses: Expense[] }
  | { status: "error" };

export interface ExpenseListProps {
  /**
   * Invoked when the user activates the empty state's action. This block does not compose
   * `expense-form.tsx` on the same screen (that happens in Block 9's `page.tsx`), so it cannot
   * move focus to the real textarea itself -- the caller that DOES compose both components wires
   * this to that focus.
   */
  onEmptyStateAction?: () => void;
  /**
   * The expense most recently created by `expense-form.tsx`, passed down by `page.tsx` (Block 9).
   * A new object reference (not just new field values) is what triggers insertion -- the caller
   * is expected to hand this a freshly created object per successful submission, e.g. via
   * `useState` from `ExpenseForm`'s `onCreated`.
   */
  newExpense?: CreatedExpense | null;
}

export function ExpenseList({ onEmptyStateAction, newExpense }: ExpenseListProps) {
  const [state, setState] = React.useState<ListState>({ status: "loading" });
  const lastInsertedExpenseRef = React.useRef<CreatedExpense | null>(null);
  const handleUnauthorized = useRedirectOnUnauthorized();
  // Block 12 (spec-FEAT-005a.md): which expense (if any) is currently being edited/deleted --
  // owned here, at list level, because `expense-edit-dialog.tsx`/`confirm-dialog.tsx` are mounted
  // ONCE for the whole list (not one instance per row).
  const [editingExpense, setEditingExpense] = React.useState<Expense | null>(null);
  const [deletingExpense, setDeletingExpense] = React.useState<Expense | null>(null);

  React.useEffect(() => {
    if (!newExpense || newExpense === lastInsertedExpenseRef.current) return;
    lastInsertedExpenseRef.current = newExpense;
    setState((previous) => {
      // Nothing to insert into yet (still loading, or the initial load failed): the expense is
      // already persisted server-side, so the next successful load will include it anyway.
      if (previous.status !== "success") return previous;
      return {
        status: "success",
        expenses: insertExpenseByWhenDescending(previous.expenses, newExpense),
      };
    });
  }, [newExpense]);

  const loadExpenses = React.useCallback(async () => {
    setState({ status: "loading" });
    try {
      const response = await apiRequest("/expenses");
      // Block 7 (spec-FEAT-004b), AC-06: a 401 means the session expired or is absent -- redirect
      // to /login instead of the generic error state; the redirect replaces it, not coexists.
      if (handleUnauthorized(response)) return;
      if (!response.ok) {
        setState({ status: "error" });
        return;
      }
      const body = (await response.json()) as ExpensesResponse;
      setState({ status: "success", expenses: body.expenses });
    } catch {
      // Network failure (fetch itself rejects, no response at all): same treatment as a 500.
      setState({ status: "error" });
    }
  }, [handleUnauthorized]);

  React.useEffect(() => {
    void loadExpenses();
  }, [loadExpenses]);

  // Block 12 (spec-FEAT-005a.md): reflects a successful edit in the corresponding row without a
  // full reload (RF-68 of PRD.md). `expense-edit-dialog.tsx` already closed itself by the time
  // this fires, so this only updates the list and notifies -- it never touches dialog state.
  function handleExpenseUpdated(updated: Expense) {
    setState((previous) =>
      previous.status === "success"
        ? {
            status: "success",
            expenses: previous.expenses.map((expense) =>
              expense.id === updated.id ? updated : expense
            ),
          }
        : previous
    );
    notify("success", EXPENSE_UPDATED_MESSAGE);
  }

  // Closes the confirmation immediately on confirm (it already did its job -- confirming intent)
  // and only then performs the actual `DELETE`. No optimistic removal: the expense stays in
  // `state.expenses` until the 204 is confirmed (spec's Error handling section).
  async function handleConfirmDelete() {
    if (!deletingExpense) return;
    const target = deletingExpense;
    setDeletingExpense(null);
    try {
      const response = await apiRequest(`/expenses/${target.id}`, { method: "DELETE" });
      if (handleUnauthorized(response)) return;
      if (!response.ok) {
        notify("error", GENERIC_ERROR_MESSAGE);
        return;
      }
      setState((previous) =>
        previous.status === "success"
          ? {
              status: "success",
              expenses: previous.expenses.filter((expense) => expense.id !== target.id),
            }
          : previous
      );
      notify("success", EXPENSE_DELETED_MESSAGE);
    } catch {
      // Network failure (fetch itself rejects, no response at all): same treatment as a 500.
      notify("error", GENERIC_ERROR_MESSAGE);
    }
  }

  if (state.status === "loading") {
    return (
      <div aria-busy="true" aria-live="polite" className="flex flex-col gap-2">
        <span className="sr-only">Cargando gastos...</span>
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div data-state="error" className="flex flex-col items-start gap-2">
        <p role="alert">{GENERIC_ERROR_MESSAGE}</p>
        <Button type="button" variant="outline" onClick={() => void loadExpenses()}>
          Reintentar
        </Button>
      </div>
    );
  }

  if (state.expenses.length === 0) {
    return (
      <div data-state="empty" className="flex flex-col items-start gap-2">
        <p>{EMPTY_STATE_MESSAGE}</p>
        <Button type="button" variant="outline" onClick={() => onEmptyStateAction?.()}>
          Cargar un gasto
        </Button>
      </div>
    );
  }

  return (
    // Block 12 regression guard (AGENTS.md / daw-arch-auditor WARN): the `<ul>` stays exactly as
    // it was -- wrapped in a `Fragment`, not a new `<div>`, so adding the edit/delete dialogs does
    // not introduce a scroll container of its own around the list.
    <>
      <ul aria-label="Listado de gastos" className="flex flex-col gap-2">
        {state.expenses.map((expense) => (
          <ExpenseRow
            key={expense.id}
            expense={expense}
            onEdit={setEditingExpense}
            onDelete={setDeletingExpense}
          />
        ))}
      </ul>
      {editingExpense ? (
        <ExpenseEditDialog
          expense={editingExpense}
          open
          onOpenChange={(open) => {
            if (!open) setEditingExpense(null);
          }}
          onUpdated={handleExpenseUpdated}
        />
      ) : null}
      <ConfirmDialog
        open={deletingExpense !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingExpense(null);
        }}
        itemName={deletingExpense?.name ?? ""}
        onConfirm={() => void handleConfirmDelete()}
      />
    </>
  );
}
