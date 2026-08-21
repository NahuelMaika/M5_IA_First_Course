import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "@/lib/api/client";
import { notify } from "@/lib/notifications/notifications";

import { ExpenseForm } from "./expense-form";

// Block 7 (spec-FEAT-003b) wires submit to the real `POST /expenses` call. Every test in this file
// mocks both boundary modules so no test ever touches the network or the real toast UI:
// - `@/lib/api/client`: the ONLY module allowed to build a request towards `apps/api` (Block 5).
// - `@/lib/notifications/notifications`: the ONLY module allowed to raise a notification (Block 4).
vi.mock("@/lib/api/client", () => ({
  apiRequest: vi.fn(),
}));
vi.mock("@/lib/notifications/notifications", () => ({
  notify: vi.fn(),
}));

const mockedApiRequest = vi.mocked(apiRequest);
const mockedNotify = vi.mocked(notify);

const VALID_INPUT = "Almuerzo $2000";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const CREATED_EXPENSE_BODY = {
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

// vitest.setup.ts does not register global afterEach(cleanup) (no `test.globals: true`), so each
// test file with multiple `render()` calls must clean up the DOM itself between tests.
afterEach(() => {
  cleanup();
  mockedApiRequest.mockReset();
  mockedNotify.mockReset();
});

describe("ExpenseForm — client-side validation (Block 6, still exercised through Block 7's wiring)", () => {
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
    expect(mockedApiRequest).not.toHaveBeenCalled();
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
    await user.type(textarea, VALID_INPUT);

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
    mockedApiRequest.mockResolvedValueOnce(jsonResponse(201, CREATED_EXPENSE_BODY));
    const user = userEvent.setup();
    render(<ExpenseForm />);
    const textarea = screen.getByRole("textbox", { name: /gasto/i });

    await user.click(textarea);
    await user.type(textarea, VALID_INPUT);
    await user.tab();
    const button = screen.getByRole("button", { name: /guardar/i });

    expect(button).toHaveFocus();
    // Inherited from the Block 3 Button primitive (Base UI) -- confirms the focus-visible ring
    // is not stripped by this component's own usage.
    expect(button.className).toMatch(/focus-visible:ring-3/);

    await user.keyboard("{Enter}");

    await waitFor(() => expect(mockedApiRequest).toHaveBeenCalledTimes(1));
  });
});

// Block 7 (spec-FEAT-003b): submit, resultado interpretado y rechazo.
describe("ExpenseForm — submit (Block 7)", () => {
  it("201 with recognizable Monto and Lugar shows the interpreted detail, visually separated, with the amount as the most visually prominent datum, and clears the field", async () => {
    mockedApiRequest.mockResolvedValueOnce(jsonResponse(201, CREATED_EXPENSE_BODY));
    const user = userEvent.setup();
    render(<ExpenseForm />);
    const textarea = screen.getByRole("textbox", { name: /gasto/i });
    const button = screen.getByRole("button", { name: /guardar/i });

    await user.click(textarea);
    await user.type(textarea, VALID_INPUT);
    await user.click(button);

    const amountText = await screen.findByText(/2000\.00/);
    expect(screen.getByText("Almuerzo")).toBeInTheDocument();
    expect(screen.getByText("Comida")).toBeInTheDocument();
    // The amount carries the strongest visual weight of the interpreted detail -- a larger, bolder
    // typographic scale than the rest of the detail (name/category/date use the default scale).
    expect(amountText.className).toMatch(/text-3xl/);
    expect(amountText.className).toMatch(/font-bold/);

    expect(textarea).toHaveValue("");
  });

  it("shows a progress indicator and disables the button while the request is in flight, and returns to normal once it resolves", async () => {
    let resolveRequest!: (response: Response) => void;
    mockedApiRequest.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRequest = resolve;
      })
    );
    const user = userEvent.setup();
    render(<ExpenseForm />);
    const textarea = screen.getByRole("textbox", { name: /gasto/i });
    const button = screen.getByRole("button", { name: /guardar/i });

    await user.click(textarea);
    await user.type(textarea, VALID_INPUT);
    await user.click(button);

    const inFlightButton = screen.getByRole("button", { name: /guardando/i });
    expect(inFlightButton).toBeDisabled();

    resolveRequest(jsonResponse(201, CREATED_EXPENSE_BODY));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^guardar$/i })).not.toBeDisabled();
    });
  });

  it("422 does not clear the text field and does not add anything to the interpreted result", async () => {
    mockedApiRequest.mockResolvedValueOnce(jsonResponse(422, { reason: "amount_zero" }));
    const user = userEvent.setup();
    render(<ExpenseForm />);
    const textarea = screen.getByRole("textbox", { name: /gasto/i });
    const button = screen.getByRole("button", { name: /guardar/i });

    await user.click(textarea);
    await user.type(textarea, VALID_INPUT);
    await user.click(button);

    await waitFor(() => expect(mockedNotify).toHaveBeenCalledTimes(1));
    expect(mockedNotify).toHaveBeenCalledWith("error", expect.any(String));
    expect(textarea).toHaveValue(VALID_INPUT);
    expect(screen.queryByText("Comida")).not.toBeInTheDocument();
  });

  it("400/401/500 show a generic error notification without attempting to read `reason` from the response", async () => {
    for (const status of [400, 401, 500]) {
      mockedApiRequest.mockReset();
      mockedNotify.mockReset();
      // Deliberately includes a valid `reason` in the body: if the component read it, the
      // notification would carry the mapped "amount_zero" message instead of the generic one.
      mockedApiRequest.mockResolvedValueOnce(jsonResponse(status, { reason: "amount_zero" }));
      const user = userEvent.setup();
      render(<ExpenseForm />);
      const textarea = screen.getByRole("textbox", { name: /gasto/i });
      const button = screen.getByRole("button", { name: /guardar/i });

      await user.click(textarea);
      await user.type(textarea, VALID_INPUT);
      await user.click(button);

      await waitFor(() => expect(mockedNotify).toHaveBeenCalledTimes(1));
      const [, message] = mockedNotify.mock.calls[0]!;
      expect(message).toMatch(/ocurrió un error/i);
      expect(message).not.toMatch(/\$0/);
      expect(textarea).toHaveValue(VALID_INPUT);

      cleanup();
    }
  });

  it("a network failure (fetch rejects) is treated the same as a 500", async () => {
    mockedApiRequest.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    render(<ExpenseForm />);
    const textarea = screen.getByRole("textbox", { name: /gasto/i });
    const button = screen.getByRole("button", { name: /guardar/i });

    await user.click(textarea);
    await user.type(textarea, VALID_INPUT);
    await user.click(button);

    await waitFor(() => expect(mockedNotify).toHaveBeenCalledTimes(1));
    expect(mockedNotify).toHaveBeenCalledWith("error", expect.stringMatching(/ocurrió un error/i));
    expect(textarea).toHaveValue(VALID_INPUT);
  });
});
