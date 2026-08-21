"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/api/client";

// Block 8 (spec-FEAT-003b): shared with the load-error inline state -- kept as a plain string,
// not read from the response body (401/500/network all collapse into the same generic message,
// same policy Block 7 applies to the form's own submit failures).
const GENERIC_ERROR_MESSAGE = "Ocurrió un error, intentá de nuevo.";
const EMPTY_STATE_MESSAGE = "Todavía no cargaste ningún gasto. Empezá agregando el primero.";

/**
 * Shape of a single item in a 200 response body from `GET /expenses`
 * (`apps/api` FEAT-003a). This block does not render a per-row final design (that lands in
 * Block 9's `expense-row.tsx`) -- just enough per row to be recognizable.
 */
interface Expense {
  id: string;
  amount: string;
  place: string;
  when: string;
  category: string;
  categoryOrigin: string;
  description: string;
  name: string;
  type: string;
  currency: string;
}

interface ExpensesResponse {
  expenses: Expense[];
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
}

export function ExpenseList({ onEmptyStateAction }: ExpenseListProps) {
  const [state, setState] = React.useState<ListState>({ status: "loading" });

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
        <li key={expense.id}>
          {expense.name} — {expense.currency} {expense.amount}
        </li>
      ))}
    </ul>
  );
}
