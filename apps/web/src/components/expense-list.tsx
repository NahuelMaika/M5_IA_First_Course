"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/api/client";

import { ExpenseRow, type CreatedExpense, type Expense } from "./expense-row";

// Block 8 (spec-FEAT-003b): shared with the load-error inline state -- kept as a plain string,
// not read from the response body (401/500/network all collapse into the same generic message,
// same policy Block 7 applies to the form's own submit failures).
const GENERIC_ERROR_MESSAGE = "Ocurrió un error, intentá de nuevo.";
const EMPTY_STATE_MESSAGE = "Todavía no cargaste ningún gasto. Empezá agregando el primero.";

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
  }, []);

  React.useEffect(() => {
    void loadExpenses();
  }, [loadExpenses]);

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
    <ul aria-label="Listado de gastos" className="flex flex-col gap-2">
      {state.expenses.map((expense) => (
        <ExpenseRow key={expense.id} expense={expense} />
      ))}
    </ul>
  );
}
