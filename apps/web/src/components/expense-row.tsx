/**
 * Single row of the expenses list (Block 9 — spec-FEAT-003b).
 *
 * Owns the canonical shape of an expense as consumed by the UI: `expense-list.tsx` renders one of
 * these per item, and `expense-form.tsx` reuses `CreatedExpense` (the same shape minus `id`, since
 * a fresh 201 from `POST /expenses` never carries one — confirmed in Block 7) for the value it
 * hands back through `onCreated`.
 */
export interface Expense {
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

/** Shape of a freshly created expense: same as `Expense`, without a server-assigned `id`. */
export type CreatedExpense = Omit<Expense, "id">;

export interface ExpenseRowProps {
  expense: Expense;
}

function formatExpenseDate(isoDate: string): string {
  // Fixed locale/timeZone, same policy as expense-form.tsx's own formatter: this is user-facing
  // display, but a floating value here would make the same stored date read differently depending
  // on the visitor's OS settings.
  return new Date(isoDate).toLocaleDateString("es-AR", { timeZone: "UTC" });
}

/**
 * RF-72/AC-69: fecha, concepto, monto y categoría quedan visualmente separados, con el monto como
 * dato de mayor peso visual. RF-74/AC-70: el concepto envuelve en varias líneas sin truncar --
 * nunca `truncate` ni `text-overflow: ellipsis` -- dejando crecer la fila en alto.
 */
export function ExpenseRow({ expense }: ExpenseRowProps) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg border border-border p-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="break-words text-sm font-medium">{expense.name}</p>
        <p className="text-xs text-muted-foreground">{expense.category}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <p data-slot="expense-amount" className="text-lg font-bold">
          {expense.currency} {expense.amount}
        </p>
        <p className="text-xs text-muted-foreground">{formatExpenseDate(expense.when)}</p>
      </div>
    </li>
  );
}
