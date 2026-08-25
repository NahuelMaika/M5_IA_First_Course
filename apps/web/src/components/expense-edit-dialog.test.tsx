import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "@/lib/api/client";
import { notify } from "@/lib/notifications/notifications";

import { ExpenseEditDialog } from "./expense-edit-dialog";
import type { Expense } from "./expense-row";

// Block 11 (spec-FEAT-005a). Same boundary-mocking convention as expense-form.test.tsx: every
// test mocks both modules so nothing here ever touches the network or the real toast UI.
vi.mock("@/lib/api/client", () => ({
  apiRequest: vi.fn(),
}));
vi.mock("@/lib/notifications/notifications", () => ({
  notify: vi.fn(),
}));
// Round 2 correction: `submitPatch`/`loadCategories` now reuse `useRedirectOnUnauthorized`, which
// calls `useRouter()` from `next/navigation` -- without this mock every render fails with
// "invariant expected app router to be mounted" (same fix as expense-form.test.tsx's Block 8 mock).
const mockedPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockedPush }),
}));

const mockedApiRequest = vi.mocked(apiRequest);
const mockedNotify = vi.mocked(notify);

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Computed relative to the real clock (days in the past, UTC calendar) instead of a hardcoded
// year -- the component validates "not future / not older than 12 months" against `new Date()` at
// render time, so a fixed literal date would eventually start failing once real time passes it.
function isoDateDaysAgo(days: number): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days)
  ).toISOString();
}

const EXPENSE: Expense = {
  id: "exp-1",
  amount: "2000.00",
  place: "restaurante",
  when: isoDateDaysAgo(5),
  category: "Comida",
  categoryOrigin: "automatica",
  description: "",
  name: "Almuerzo",
  type: "Personal",
  currency: "ARS",
};

const CATEGORIES_BODY = {
  categories: [
    { id: "cat-comida", name: "Comida", active: true },
    { id: "cat-transporte", name: "Transporte", active: true },
  ],
};

/** Routes the mocked `apiRequest` to the categories fixture for `GET /categories` and to
 * `patchResponse` for `PATCH /expenses/:id` -- every test in this file needs the categories call
 * to resolve so the select preloads and the submit button becomes enabled. */
function mockCategoriesThenPatch(patchResponse: Response) {
  mockedApiRequest.mockImplementation(async (path, init) => {
    if (path === "/categories") {
      return jsonResponse(200, CATEGORIES_BODY);
    }
    if (path === `/expenses/${EXPENSE.id}` && init?.method === "PATCH") {
      return patchResponse;
    }
    throw new Error(`Unexpected apiRequest call: ${String(init?.method ?? "GET")} ${path}`);
  });
}

async function waitForCategoryPreload() {
  await waitFor(() =>
    expect(screen.getByRole("combobox", { name: "Categoría" })).toHaveTextContent("Comida")
  );
}

// vitest.setup.ts does not register global afterEach(cleanup) (no `test.globals: true`), so this
// file cleans up its own renders between tests, same convention as dialog.test.tsx/select.test.tsx.
afterEach(() => {
  cleanup();
  mockedApiRequest.mockReset();
  mockedNotify.mockReset();
  mockedPush.mockReset();
});

describe("ExpenseEditDialog", () => {
  it("preloads the expense's current amount/place/date/category/description — AC-08", async () => {
    mockCategoriesThenPatch(jsonResponse(200, {}));

    render(
      <ExpenseEditDialog
        expense={{ ...EXPENSE, description: "Nota vigente" }}
        open
        onOpenChange={() => {}}
      />
    );

    expect(screen.getByLabelText("Monto")).toHaveValue(2000);
    expect(screen.getByLabelText("Lugar")).toHaveValue("restaurante");
    expect(screen.getByLabelText("Fecha")).toHaveValue(EXPENSE.when.slice(0, 10));
    expect(screen.getByLabelText("Descripción")).toHaveValue("Nota vigente");

    await waitForCategoryPreload();
  });

  it("sends the edited fields to PATCH /expenses/:id", async () => {
    const user = userEvent.setup();
    mockCategoriesThenPatch(jsonResponse(200, { ...EXPENSE, place: "lugar nuevo" }));

    render(<ExpenseEditDialog expense={EXPENSE} open onOpenChange={() => {}} />);
    await waitForCategoryPreload();

    const placeInput = screen.getByLabelText("Lugar");
    await user.clear(placeInput);
    await user.type(placeInput, "lugar nuevo");

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      const patchCall = mockedApiRequest.mock.calls.find(
        ([path]) => path === `/expenses/${EXPENSE.id}`
      );
      expect(patchCall).toBeDefined();
    });

    const [, patchInit] = mockedApiRequest.mock.calls.find(
      ([path]) => path === `/expenses/${EXPENSE.id}`
    )!;
    expect(patchInit?.method).toBe("PATCH");
    expect(JSON.parse(patchInit?.body as string)).toEqual({
      amount: 2000,
      place: "lugar nuevo",
      when: EXPENSE.when.slice(0, 10),
      categoryId: "cat-comida",
      description: "",
    });
  });

  it("sends the new value in the PATCH when Descripción is edited — AC-11", async () => {
    const user = userEvent.setup();
    mockCategoriesThenPatch(jsonResponse(200, { ...EXPENSE, description: "Nota nueva" }));

    render(<ExpenseEditDialog expense={EXPENSE} open onOpenChange={() => {}} />);
    await waitForCategoryPreload();

    const descriptionInput = screen.getByLabelText("Descripción");
    await user.type(descriptionInput, "Nota nueva");

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      const patchCall = mockedApiRequest.mock.calls.find(
        ([path]) => path === `/expenses/${EXPENSE.id}`
      );
      expect(patchCall).toBeDefined();
    });

    const [, patchInit] = mockedApiRequest.mock.calls.find(
      ([path]) => path === `/expenses/${EXPENSE.id}`
    )!;
    expect(JSON.parse(patchInit?.body as string)).toMatchObject({ description: "Nota nueva" });
  });

  it("sends description: \"\" in the PATCH when Descripción is cleared — AC-11", async () => {
    const user = userEvent.setup();
    mockCategoriesThenPatch(jsonResponse(200, { ...EXPENSE, description: "" }));

    render(
      <ExpenseEditDialog
        expense={{ ...EXPENSE, description: "Nota vigente" }}
        open
        onOpenChange={() => {}}
      />
    );
    await waitForCategoryPreload();

    const descriptionInput = screen.getByLabelText("Descripción");
    await user.clear(descriptionInput);

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      const patchCall = mockedApiRequest.mock.calls.find(
        ([path]) => path === `/expenses/${EXPENSE.id}`
      );
      expect(patchCall).toBeDefined();
    });

    const [, patchInit] = mockedApiRequest.mock.calls.find(
      ([path]) => path === `/expenses/${EXPENSE.id}`
    )!;
    expect(JSON.parse(patchInit?.body as string)).toMatchObject({ description: "" });
  });

  it("shows an inline error and disables submit when Descripción exceeds 300 chars — AC-12", async () => {
    const user = userEvent.setup();
    mockCategoriesThenPatch(jsonResponse(200, {}));

    render(<ExpenseEditDialog expense={EXPENSE} open onOpenChange={() => {}} />);
    await waitForCategoryPreload();

    const descriptionInput = screen.getByLabelText("Descripción");
    await user.type(descriptionInput, "a".repeat(301));
    await user.tab();

    expect(screen.getByText(/máximo 300 caracteres/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
  });

  it("closes the dialog after a successful save — AC-08", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    mockCategoriesThenPatch(jsonResponse(200, EXPENSE));

    render(<ExpenseEditDialog expense={EXPENSE} open onOpenChange={onOpenChange} />);
    await waitForCategoryPreload();

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("shows a field's validation error as soon as it loses focus", async () => {
    const user = userEvent.setup();
    mockCategoriesThenPatch(jsonResponse(200, {}));

    render(<ExpenseEditDialog expense={EXPENSE} open onOpenChange={() => {}} />);
    await waitForCategoryPreload();

    const placeInput = screen.getByLabelText("Lugar");
    await user.clear(placeInput);
    await user.tab();

    expect(screen.getByText(/ingresá un lugar/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
  });

  it("shows an error notification if the PATCH fails, without closing the dialog", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    mockCategoriesThenPatch(jsonResponse(422, { error: "invalid_category" }));

    render(<ExpenseEditDialog expense={EXPENSE} open onOpenChange={onOpenChange} />);
    await waitForCategoryPreload();

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(mockedNotify).toHaveBeenCalledWith("error", expect.any(String)));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByText("Editar gasto")).toBeInTheDocument();
  });

  // Round 2 correction: a 401 on the PATCH means the session expired or is absent -- redirect to
  // /login instead of the generic notification, same policy expense-form.tsx's Block 8 applies.
  it("redirects to /login without notifying if the PATCH returns 401", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    mockCategoriesThenPatch(jsonResponse(401, {}));

    render(<ExpenseEditDialog expense={EXPENSE} open onOpenChange={onOpenChange} />);
    await waitForCategoryPreload();

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(mockedPush).toHaveBeenCalledWith("/login"));
    expect(mockedNotify).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  // Same policy applied to the categories preload -- a 401 while resolving `GET /categories`
  // (fired every time the dialog opens) is just as much a "session expired" signal as the PATCH.
  it("redirects to /login without notifying if GET /categories returns 401", async () => {
    mockedApiRequest.mockImplementation(async (path) => {
      if (path === "/categories") {
        return jsonResponse(401, {});
      }
      throw new Error(`Unexpected apiRequest call: ${path}`);
    });

    render(<ExpenseEditDialog expense={EXPENSE} open onOpenChange={() => {}} />);

    await waitFor(() => expect(mockedPush).toHaveBeenCalledWith("/login"));
    expect(mockedNotify).not.toHaveBeenCalled();
  });
});
