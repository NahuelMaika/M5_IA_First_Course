import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExpenseForm } from "./expense-form";

// vitest.setup.ts does not register global afterEach(cleanup) (no `test.globals: true`), so each
// test file with multiple `render()` calls must clean up the DOM itself between tests.
afterEach(() => {
  cleanup();
});

// Block 6 (spec-FEAT-003b.md): client-side validation only. Block 7 wires the real submit.
describe("ExpenseForm", () => {
  it("shows the required error on blur, not while typing the first character", async () => {
    const user = userEvent.setup();
    render(<ExpenseForm />);
    const textarea = screen.getByRole("textbox", { name: /gasto/i });

    await user.click(textarea);
    expect(
      screen.queryByText(/escribí un gasto antes de guardar/i)
    ).not.toBeInTheDocument();

    await user.tab();
    expect(
      screen.getByText(/escribí un gasto antes de guardar/i)
    ).toBeInTheDocument();
  });

  it("shows the length error for 501 characters", async () => {
    const user = userEvent.setup();
    render(<ExpenseForm />);
    const textarea = screen.getByRole("textbox", { name: /gasto/i });
    const tooLongValue = "a".repeat(501);

    await user.click(textarea);
    await user.paste(tooLongValue);
    await user.tab();

    expect(screen.getByText(/máximo 500 caracteres/i)).toBeInTheDocument();
  });

  it("hides an already-visible error as soon as the value becomes valid, without a new submit attempt", async () => {
    const user = userEvent.setup();
    render(<ExpenseForm />);
    const textarea = screen.getByRole("textbox", { name: /gasto/i });

    await user.click(textarea);
    await user.tab();
    expect(
      screen.getByText(/escribí un gasto antes de guardar/i)
    ).toBeInTheDocument();

    await user.click(textarea);
    await user.type(textarea, "Almuerzo $2000");

    expect(
      screen.queryByText(/escribí un gasto antes de guardar/i)
    ).not.toBeInTheDocument();
  });

  it("associates the error message via aria-describedby and marks aria-invalid while the error is visible", async () => {
    const user = userEvent.setup();
    render(<ExpenseForm />);
    const textarea = screen.getByRole("textbox", { name: /gasto/i });

    await user.click(textarea);
    await user.tab();

    const errorMessage = screen.getByText(
      /escribí un gasto antes de guardar/i
    );
    expect(textarea).toHaveAttribute("aria-invalid", "true");
    expect(textarea).toHaveAttribute("aria-describedby", errorMessage.id);
  });

  it("the submit button is reachable and operable via keyboard alone, with a visible focus indicator", async () => {
    const handleSubmit = vi.fn();
    const user = userEvent.setup();
    render(<ExpenseForm onSubmit={handleSubmit} />);
    const textarea = screen.getByRole("textbox", { name: /gasto/i });
    const button = screen.getByRole("button", { name: /guardar/i });

    await user.click(textarea);
    await user.type(textarea, "Almuerzo $2000");
    await user.tab();

    expect(button).toHaveFocus();
    // Inherited from the Block 3 Button primitive (Base UI) -- confirms the focus-visible ring
    // is not stripped by this component's own usage.
    expect(button.className).toMatch(/focus-visible:ring-3/);

    await user.keyboard("{Enter}");

    expect(handleSubmit).toHaveBeenCalledWith("Almuerzo $2000");
  });

  it("does not perform any network call in this block", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(() => {
      throw new Error("expense-form must not call fetch in Block 6");
    });
    const user = userEvent.setup();
    render(<ExpenseForm />);
    const textarea = screen.getByRole("textbox", { name: /gasto/i });
    const button = screen.getByRole("button", { name: /guardar/i });

    await user.click(textarea);
    await user.type(textarea, "Almuerzo $2000");
    await user.click(button);

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
