import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { logoutUser } from "@/lib/api/auth";
import { notify } from "@/lib/notifications/notifications";

import { LogoutButton } from "./logout-button";

// Block 6 (spec-FEAT-004b) wires the button's click to `logoutUser` (Block 3). Every test in this
// file mocks both boundary modules so no test ever touches the network or the real toast UI:
// - `@/lib/api/auth`: the ONLY module allowed to build a request towards `apps/api`'s `/auth/*`.
// - `@/lib/notifications/notifications`: the ONLY module allowed to raise a notification.
vi.mock("@/lib/api/auth", () => ({
  logoutUser: vi.fn(),
}));
vi.mock("@/lib/notifications/notifications", () => ({
  notify: vi.fn(),
}));

const mockedPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockedPush }),
}));

const mockedLogoutUser = vi.mocked(logoutUser);
const mockedNotify = vi.mocked(notify);

// vitest.setup.ts does not register global afterEach(cleanup) (no `test.globals: true`), so each
// test file with multiple `render()` calls must clean up the DOM itself between tests.
afterEach(() => {
  cleanup();
  mockedLogoutUser.mockReset();
  mockedNotify.mockReset();
  mockedPush.mockReset();
});

describe("LogoutButton", () => {
  it("a successful click calls logoutUser and redirects to /login (AC-03)", async () => {
    mockedLogoutUser.mockResolvedValueOnce({ outcome: "success" });
    const user = userEvent.setup();
    render(<LogoutButton />);
    const button = screen.getByRole("button", { name: /cerrar sesión/i });

    await user.click(button);

    await waitFor(() => expect(mockedLogoutUser).toHaveBeenCalledOnce());
    await waitFor(() => expect(mockedPush).toHaveBeenCalledWith("/login"));
  });

  it("unknown_error shows the generic message and does NOT redirect", async () => {
    mockedLogoutUser.mockResolvedValueOnce({ outcome: "unknown_error" });
    const user = userEvent.setup();
    render(<LogoutButton />);
    const button = screen.getByRole("button", { name: /cerrar sesión/i });

    await user.click(button);

    await waitFor(() =>
      expect(mockedNotify).toHaveBeenCalledWith(
        "error",
        expect.stringMatching(/ocurrió un error/i)
      )
    );
    expect(mockedPush).not.toHaveBeenCalled();
  });

  it("a rejected logoutUser promise is treated the same as unknown_error", async () => {
    mockedLogoutUser.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    render(<LogoutButton />);
    const button = screen.getByRole("button", { name: /cerrar sesión/i });

    await user.click(button);

    await waitFor(() =>
      expect(mockedNotify).toHaveBeenCalledWith(
        "error",
        expect.stringMatching(/ocurrió un error/i)
      )
    );
    expect(mockedPush).not.toHaveBeenCalled();
  });
});
