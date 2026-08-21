import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "@/lib/api/client";

import { ExpenseList } from "./expense-list";

// Block 8 (spec-FEAT-003b): initial load, empty state and error state. Every test mocks the
// Block 5 boundary module -- the ONLY module allowed to build a request towards `apps/api` -- so
// no test here ever touches the network.
vi.mock("@/lib/api/client", () => ({
  apiRequest: vi.fn(),
}));

const mockedApiRequest = vi.mocked(apiRequest);

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const EXPENSES_BODY = {
  expenses: [
    {
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
    },
    {
      id: "2",
      amount: "500.00",
      place: "farmacia",
      when: "2026-08-19T00:00:00.000Z",
      category: "Salud",
      categoryOrigin: "automatica",
      description: "",
      name: "Ibuprofeno",
      type: "Personal",
      currency: "ARS",
    },
  ],
};

// vitest.setup.ts does not register global afterEach(cleanup) (no `test.globals: true`), so each
// test file with multiple `render()` calls must clean up the DOM itself between tests.
afterEach(() => {
  cleanup();
  mockedApiRequest.mockReset();
});

describe("ExpenseList — initial load (Block 8)", () => {
  it("shows the list when mounted with data", async () => {
    mockedApiRequest.mockResolvedValueOnce(jsonResponse(200, EXPENSES_BODY));
    render(<ExpenseList />);

    const list = await screen.findByRole("list", { name: /gastos/i });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(screen.getByText(/almuerzo/i)).toBeInTheDocument();
    expect(screen.getByText(/ibuprofeno/i)).toBeInTheDocument();
    expect(mockedApiRequest).toHaveBeenCalledWith("/expenses");
  });

  it("shows the empty state (not the error state) when mounted with `expenses: []`, and its action invokes the caller's focus hook", async () => {
    mockedApiRequest.mockResolvedValueOnce(jsonResponse(200, { expenses: [] }));
    const onEmptyStateAction = vi.fn();
    const user = userEvent.setup();
    render(<ExpenseList onEmptyStateAction={onEmptyStateAction} />);

    const emptyState = await screen.findByText(/todavía no cargaste ningún gasto/i);
    expect(emptyState).toBeInTheDocument();
    // Completion criterion: the empty state carries none of the error state's markup/attributes.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(document.querySelector('[data-state="error"]')).not.toBeInTheDocument();

    const action = screen.getByRole("button", { name: /cargar un gasto/i });
    await user.click(action);
    expect(onEmptyStateAction).toHaveBeenCalledTimes(1);
  });

  it("shows the error in the list's place, with a retry control, when the initial load fails (401/500/network)", async () => {
    for (const failure of [
      { label: "401", setup: () => mockedApiRequest.mockResolvedValueOnce(jsonResponse(401, {})) },
      { label: "500", setup: () => mockedApiRequest.mockResolvedValueOnce(jsonResponse(500, {})) },
      {
        label: "network",
        setup: () => mockedApiRequest.mockRejectedValueOnce(new TypeError("Failed to fetch")),
      },
    ]) {
      mockedApiRequest.mockReset();
      failure.setup();
      render(<ExpenseList />);

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(/ocurrió un error/i);
      expect(screen.getByRole("button", { name: /reintentar/i })).toBeInTheDocument();

      cleanup();
    }
  });

  it("activating retry requests `GET /expenses` again without reloading the page", async () => {
    mockedApiRequest.mockResolvedValueOnce(jsonResponse(500, {}));
    const user = userEvent.setup();
    render(<ExpenseList />);

    await screen.findByRole("alert");
    expect(mockedApiRequest).toHaveBeenCalledTimes(1);

    mockedApiRequest.mockResolvedValueOnce(jsonResponse(200, EXPENSES_BODY));
    const retryButton = screen.getByRole("button", { name: /reintentar/i });
    await user.click(retryButton);

    await waitFor(() => expect(mockedApiRequest).toHaveBeenCalledTimes(2));
    await screen.findByRole("list", { name: /gastos/i });
  });
});
