"use client";

import * as React from "react";

import { ExpenseForm, type ExpenseFormHandle } from "@/components/expense-form";
import { ExpenseList } from "@/components/expense-list";
import type { CreatedExpense } from "@/components/expense-row";
import { LogoutButton } from "@/components/logout-button";

// Connects `expense-form.tsx` and `expense-list.tsx` on the same screen (Block 9 --
// spec-FEAT-003b). Two responsibilities live here, on purpose, because they cross the boundary
// between the two components and neither of them can own the wiring on its own:
// - forwards a successfully created expense from the form to the list, so it gets reflected at
//   its correct `when`-descending position without a full reload;
// - forwards the list's empty-state action to real focus on the form's textarea, via the ref
//   `expense-form.tsx` exposes for exactly this.
export default function Page() {
  const formRef = React.useRef<ExpenseFormHandle>(null);
  const [createdExpense, setCreatedExpense] = React.useState<CreatedExpense | null>(null);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">GGasIA</h1>
        <LogoutButton />
      </div>
      <ExpenseForm ref={formRef} onCreated={setCreatedExpense} />
      <ExpenseList
        newExpense={createdExpense}
        onEmptyStateAction={() => formRef.current?.focus()}
      />
    </main>
  );
}
