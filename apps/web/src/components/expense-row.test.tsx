import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ExpenseRow, type Expense } from "./expense-row";

// Block 9 (spec-FEAT-003b): a single row's presentation -- fecha/concepto/monto/categoría
// visually separated, monto with the strongest visual weight (RF-72), and concept wrapping
// without truncation (RF-74/RF-75).

afterEach(() => {
  cleanup();
});

const BASE_EXPENSE: Expense = {
  id: "1",
  amount: "2000.00",
  place: "restaurante",
  when: "2026-08-20T00:00:00.000Z",
  category: "Comida",
  categoryOrigin: "automatica",
  description: "",
  name: "Almuerzo",
  type: "Personal",
  currency: "ARS",
};

describe("ExpenseRow — layout (Block 9)", () => {
  it("shows date, concept, amount and category visually separated, with the amount as the most visually prominent datum (verified by a distinctive class)", () => {
    render(<ExpenseRow expense={BASE_EXPENSE} />);

    const name = screen.getByText("Almuerzo");
    const category = screen.getByText("Comida");
    const amount = screen.getByText(/2000\.00/);
    const date = screen.getByText(/20\/8\/2026|20\/08\/2026/);

    // Four separate DOM nodes: this is a hard failure mode this test guards against -- a single
    // concatenated string (e.g. "Almuerzo — ARS 2000.00") would collapse them into one node and
    // every one of these lookups but the first would throw.
    expect(name).toBeInTheDocument();
    expect(category).toBeInTheDocument();
    expect(amount).toBeInTheDocument();
    expect(date).toBeInTheDocument();
    expect(name).not.toBe(category);
    expect(name).not.toBe(amount);
    expect(category).not.toBe(amount);

    // The amount carries a distinctive, larger/bolder typographic scale that none of the other
    // three data points use -- not inferred from DOM order or text content.
    expect(amount.className).toMatch(/font-bold/);
    expect(amount.className).not.toEqual(name.className);
    expect(amount.className).not.toEqual(category.className);
    expect(amount.className).not.toEqual(date.className);
  });

  it("wraps a 200+ character concept across multiple lines inside a 360px-wide container, without truncating and without horizontal scroll", () => {
    const longName = "Compra de supermercado con muchos artículos variados ".repeat(5).trim(); // > 200 chars
    render(<ExpenseRow expense={{ ...BASE_EXPENSE, name: longName }} />);

    const name = screen.getByText(longName);
    expect(longName.length).toBeGreaterThan(200);
    // Never a truncation/clamp utility: no `truncate` (Tailwind's line-clamp-1 + overflow-hidden +
    // text-ellipsis shorthand) and no explicit `text-ellipsis`/`line-clamp-*`.
    expect(name.className).not.toMatch(/\btruncate\b/);
    expect(name.className).not.toMatch(/text-ellipsis/);
    expect(name.className).not.toMatch(/line-clamp-/);
    expect(name.className).not.toMatch(/whitespace-nowrap/);
    // Explicit word-wrapping utility so long unbroken text still wraps instead of overflowing.
    expect(name.className).toMatch(/break-words/);

    const row = name.closest("li");
    expect(row).not.toBeNull();
    expect(row?.className).not.toMatch(/overflow-x-(auto|scroll)/);
  });

  it("does not clip or scroll horizontally regardless of the amount's own class list", () => {
    render(<ExpenseRow expense={BASE_EXPENSE} />);
    const row = screen.getByText("Almuerzo").closest("li");
    expect(row?.className).not.toMatch(/overflow-x-(auto|scroll)/);
  });
});
