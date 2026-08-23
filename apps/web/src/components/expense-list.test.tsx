import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "@/lib/api/client";
import Page from "@/app/page";

import { ExpenseList } from "./expense-list";

// Block 8 (spec-FEAT-003b): initial load, empty state and error state. Every test mocks the
// Block 5 boundary module -- the ONLY module allowed to build a request towards `apps/api` -- so
// no test here ever touches the network.
vi.mock("@/lib/api/client", () => ({
  apiRequest: vi.fn(),
}));
// Block 9's full-page tests below render `page.tsx`, which composes `expense-form.tsx` -- that
// component imports the Block 4 notifications module at module scope, so it is mocked here too
// even though none of these tests trigger a notification.
vi.mock("@/lib/notifications/notifications", () => ({
  notify: vi.fn(),
}));
// `page.tsx` also mounts Block 6's `LogoutButton`, which calls `useRouter()` -- without this mock,
// every full-page render below fails with "invariant expected app router to be mounted".
const mockedPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockedPush }),
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
  mockedPush.mockClear();
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

  it("shows the error in the list's place, with a retry control, when the initial load fails (500/network)", async () => {
    for (const failure of [
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
      // Block 7 regression guard: only 401 redirects -- 500/network keep showing the generic
      // error state and never navigate.
      expect(mockedPush).not.toHaveBeenCalled();

      cleanup();
    }
  });

  // Block 7: AC-06 -- a 401 means an expired/absent session, so it redirects to /login instead of
  // showing the generic error state (unlike 500/network, covered above).
  it("redirects to /login without showing the generic error state when the initial load returns 401 (AC-06)", async () => {
    mockedApiRequest.mockResolvedValueOnce(jsonResponse(401, {}));
    render(<ExpenseList />);

    await waitFor(() => expect(mockedPush).toHaveBeenCalledWith("/login"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(document.querySelector('[data-state="error"]')).not.toBeInTheDocument();
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

// Block 9 (spec-FEAT-003b): reflecting a just-created expense at its correct `when`-descending
// position, and the list's own layout constraints (no `overflow-y` container of its own).
const CREATED_EXPENSE_BASE = {
  amount: "300.00",
  place: "kiosco",
  category: "Comida",
  categoryOrigin: "automatica",
  description: "",
  name: "Golosinas",
  type: "Personal",
  currency: "ARS",
};

describe("ExpenseList — reflecting a newly created expense (Block 9)", () => {
  it("inserts a newly created expense with `when` today before an existing one with `when` yesterday", async () => {
    mockedApiRequest.mockResolvedValueOnce(jsonResponse(200, EXPENSES_BODY)); // when: 2026-08-20, 2026-08-19
    const { rerender } = render(<ExpenseList newExpense={null} />);
    await screen.findByRole("list", { name: /gastos/i });

    const todayExpense = { ...CREATED_EXPENSE_BASE, when: "2026-08-21T00:00:00.000Z" }; // today
    rerender(<ExpenseList newExpense={todayExpense} />);

    const list = await screen.findByRole("list", { name: /gastos/i });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(within(items[0]!).getByText("Golosinas")).toBeInTheDocument();
    expect(within(items[1]!).getByText("Almuerzo")).toBeInTheDocument();
    expect(within(items[2]!).getByText("Ibuprofeno")).toBeInTheDocument();
  });

  it("inserts a newly created expense with `when` 3 days ago AFTER an existing one with `when` yesterday (PRD loop 1: not always on top)", async () => {
    mockedApiRequest.mockResolvedValueOnce(jsonResponse(200, EXPENSES_BODY)); // when: 2026-08-20, 2026-08-19
    const { rerender } = render(<ExpenseList newExpense={null} />);
    await screen.findByRole("list", { name: /gastos/i });

    // 3 days older than the existing "yesterday" item (2026-08-19) -- the case PRD loop 1 fixed:
    // creating this expense today must NOT place it first, it belongs after both existing rows.
    const threeDaysAgoExpense = { ...CREATED_EXPENSE_BASE, when: "2026-08-16T00:00:00.000Z" };
    rerender(<ExpenseList newExpense={threeDaysAgoExpense} />);

    const list = await screen.findByRole("list", { name: /gastos/i });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(within(items[0]!).getByText("Almuerzo")).toBeInTheDocument();
    expect(within(items[1]!).getByText("Ibuprofeno")).toBeInTheDocument();
    expect(within(items[2]!).getByText("Golosinas")).toBeInTheDocument();
  });

  it("does not have its own overflow-y auto/scroll container -- vertical scroll stays delegated to the document", async () => {
    mockedApiRequest.mockResolvedValueOnce(jsonResponse(200, EXPENSES_BODY));
    render(<ExpenseList newExpense={null} />);

    const list = await screen.findByRole("list", { name: /gastos/i });
    expect(list.className).not.toMatch(/overflow-y-(auto|scroll)/);
    expect(list.className).not.toMatch(/\bscroll(-\w+)?\b/);

    let node: HTMLElement | null = list;
    while (node) {
      expect(node.className).not.toMatch(/overflow-y-(auto|scroll)/);
      node = node.parentElement;
    }
  });
});

// Block 9 (spec-FEAT-003b): `page.tsx` connects `expense-form.tsx` and `expense-list.tsx` on the
// same screen -- these two tests validate AC-14 and AC-13 at that composed, whole-screen level,
// not just per component in isolation.
describe("Page — full screen (Block 9)", () => {
  it("tabbing from the first control reaches and operates 100% of the screen's interactive controls, each with a visible focus indicator (AC-14)", async () => {
    mockedApiRequest.mockResolvedValueOnce(jsonResponse(200, EXPENSES_BODY));
    const user = userEvent.setup();
    render(<Page />);
    await screen.findByRole("list", { name: /gastos/i });

    // The list already has data (no empty-state button) and loaded successfully (no retry
    // button), so the screen's interactive controls are Block 6's `LogoutButton` plus the form's
    // textarea and its submit button -- confirmed by counting every native focusable element on
    // the page.
    const focusableElements = Array.from(
      document.querySelectorAll<HTMLElement>(
        'button, textarea, input, a[href], [tabindex]:not([tabindex="-1"])'
      )
    );
    expect(focusableElements).toHaveLength(3);

    // Neither `LogoutButton` nor the form's controls set an explicit `tabIndex`, so tab order
    // follows DOM order. In `page.tsx`, `<LogoutButton/>` sits in the header row above
    // `<ExpenseForm/>`, so it is reached first, followed by the textarea and then the submit
    // button.
    expect(focusableElements[0]).toHaveAccessibleName(/cerrar sesión/i);
    expect(focusableElements[1].tagName).toBe("TEXTAREA");
    expect(focusableElements[2]).toHaveAttribute("type", "submit");

    for (const element of focusableElements) {
      await user.tab();
      expect(element).toHaveFocus();
      // Inherited from the Block 3 Base UI primitives (Button/Textarea): confirms the
      // focus-visible ring utility is present on every reachable control, not stripped anywhere
      // along the way from primitive to composed screen.
      expect(element.className).toMatch(/focus-visible:ring-3/);
    }
  });

  it("does not produce document horizontal scroll and keeps every control inside the viewport, at 360px and at 1280px (AC-13)", async () => {
    for (const width of [360, 1280]) {
      mockedApiRequest.mockReset();
      mockedApiRequest.mockResolvedValueOnce(jsonResponse(200, EXPENSES_BODY));
      Object.defineProperty(window, "innerWidth", {
        writable: true,
        configurable: true,
        value: width,
      });

      render(<Page />);
      await screen.findByRole("list", { name: /gastos/i });

      // jsdom does not run a real layout engine (no computed pixel geometry to assert against),
      // so this narrows to what IS observable from the DOM at this width: no element opts into
      // horizontal scrolling, and no element carries a fixed pixel width that could overflow a
      // 360px viewport regardless of content -- both would defeat NFR-02/RF-74 at any width.
      const everyElement = document.querySelectorAll<HTMLElement>("*");
      for (const element of everyElement) {
        expect(element.className).not.toMatch(/overflow-x-(auto|scroll)/);
        expect(element.getAttribute("style") ?? "").not.toMatch(/width\s*:\s*\d/);
        if (typeof element.className === "string") {
          expect(element.className).not.toMatch(/\[[^\]]*[0-9.]+(px|rem|em)[^\]]*\]/);
        }
      }

      cleanup();
    }
  });

  it("keeps every interactive control at or above the 24×24px CSS minimum touch target, at the full-screen level (AC-13/NFR-03)", async () => {
    mockedApiRequest.mockResolvedValueOnce(jsonResponse(200, EXPENSES_BODY));
    render(<Page />);
    await screen.findByRole("list", { name: /gastos/i });

    // Same universe as AC-14: the list already has data, so the screen's interactive controls
    // are `LogoutButton` plus the form's textarea and its submit button.
    const focusableElements = Array.from(
      document.querySelectorAll<HTMLElement>(
        'button, textarea, input, a[href], [tabindex]:not([tabindex="-1"])'
      )
    );
    expect(focusableElements).toHaveLength(3);

    // jsdom does not run a real layout engine, so pixel geometry (getBoundingClientRect) is
    // never real here -- verify the 24px CSS floor via the Tailwind spacing-scale classes that
    // the design system uses to size controls instead. `h-6`/`size-6` (24px) is the project's
    // smallest defined control size and equals the minimum; `h-7`/`size-7` (28px), `h-8`/`size-8`
    // (32px, the Button default), `h-9`/`size-9` (36px) and `min-h-16` (64px, the Textarea) are
    // all above it.
    const meetsMinimumTouchTarget = /\b(h|size)-(6|7|8|9|10|11|12|14|16)\b|\bmin-h-16\b/;
    // A fixed pixel arbitrary value below 24px (e.g. `h-[20px]`) would defeat the minimum
    // regardless of any other class present, so it is rejected explicitly rather than trusted
    // to be absent.
    const belowMinimumArbitraryPx = /\b(h|size|min-h|min-w)-\[(0|[1-9](\.\d+)?|1\d(\.\d+)?|2[0-3](\.\d+)?)px\]/;

    for (const element of focusableElements) {
      expect(element.className).toMatch(meetsMinimumTouchTarget);
      expect(element.className).not.toMatch(belowMinimumArbitraryPx);
    }
  });
});

// Block 9 (spec-FEAT-003b), round 2: exercises the REAL wiring end-to-end -- `Page` composes
// `ExpenseForm` and `ExpenseList`, and these two tests drive them through their actual DOM
// controls (real textarea, real submit, real empty-state button) instead of simulating the
// result via `rerender(<ExpenseList newExpense={...} />)` or calling `onCreated`/`focus()`
// directly. That is what proves `onCreated` and `ExpenseFormHandle.focus()` are actually
// triggered by the composed screen, not just by test code that assumes the wiring works.
describe("Page — end-to-end wiring through the real form and list (Block 9, round 2)", () => {
  const YESTERDAY_EXPENSE_BODY = {
    expenses: [
      {
        id: "1",
        amount: "500.00",
        place: "farmacia",
        when: "2026-08-20T00:00:00.000Z", // yesterday, relative to the created expense's "today"
        category: "Salud",
        categoryOrigin: "automatica",
        description: "",
        name: "Ibuprofeno",
        type: "Personal",
        currency: "ARS",
      },
    ],
  };

  const CREATED_TODAY_BODY = {
    amount: "300.00",
    place: "kiosco",
    when: "2026-08-21T00:00:00.000Z", // today, more recent than the existing "yesterday" expense
    category: "Comida",
    categoryOrigin: "automatica",
    description: "",
    name: "Golosinas",
    type: "Personal",
    currency: "ARS",
  };

  it("reflects a newly created expense at its correct when-descending position after a real form submit (Page -> ExpenseForm.onCreated -> ExpenseList)", async () => {
    mockedApiRequest.mockResolvedValueOnce(jsonResponse(200, YESTERDAY_EXPENSE_BODY));
    const user = userEvent.setup();
    render(<Page />);

    const list = await screen.findByRole("list", { name: /gastos/i });
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);

    mockedApiRequest.mockResolvedValueOnce(jsonResponse(201, CREATED_TODAY_BODY));
    const textarea = screen.getByRole("textbox", { name: /gasto/i });
    await user.type(textarea, "Golosinas $300 en el kiosco");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => {
      expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    });
    const items = within(list).getAllByRole("listitem");
    expect(within(items[0]!).getByText("Golosinas")).toBeInTheDocument();
    expect(within(items[1]!).getByText("Ibuprofeno")).toBeInTheDocument();

    // Confirms the second call really is the POST triggered by the real submit, not a leftover
    // GET -- pins down that this test went through `submitExpense`, not around it.
    expect(mockedApiRequest).toHaveBeenNthCalledWith(
      2,
      "/expenses",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("moves real focus to the form's textarea when the empty state's action is activated (Page -> ExpenseList.onEmptyStateAction -> ExpenseFormHandle.focus)", async () => {
    mockedApiRequest.mockResolvedValueOnce(jsonResponse(200, { expenses: [] }));
    const user = userEvent.setup();
    render(<Page />);

    const action = await screen.findByRole("button", { name: /cargar un gasto/i });
    await user.click(action);

    const textarea = screen.getByRole("textbox", { name: /gasto/i });
    expect(textarea).toHaveFocus();
  });
});
