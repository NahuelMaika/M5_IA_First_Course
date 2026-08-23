import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { loginUser } from "@/lib/api/auth";
import { notify } from "@/lib/notifications/notifications";

import { LoginForm } from "./login-form";

// Block 5 (spec-FEAT-004b) wires submit to `loginUser` (Block 3). Every test in this file mocks
// both boundary modules so no test ever touches the network or the real toast UI:
// - `@/lib/api/auth`: the ONLY module allowed to build a request towards `apps/api`'s `/auth/*`.
// - `@/lib/notifications/notifications`: the ONLY module allowed to raise a notification.
vi.mock("@/lib/api/auth", () => ({
  loginUser: vi.fn(),
}));
vi.mock("@/lib/notifications/notifications", () => ({
  notify: vi.fn(),
}));

const mockedPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockedPush }),
}));

const mockedLoginUser = vi.mocked(loginUser);
const mockedNotify = vi.mocked(notify);

const VALID_EMAIL = "persona@example.com";
const VALID_PASSWORD = "unaClave123";

// vitest.setup.ts does not register global afterEach(cleanup) (no `test.globals: true`), so each
// test file with multiple `render()` calls must clean up the DOM itself between tests.
afterEach(() => {
  cleanup();
  mockedLoginUser.mockReset();
  mockedNotify.mockReset();
  mockedPush.mockReset();
});

describe("LoginForm — client-side validation", () => {
  it("shows the email-format error on blur when the email does not match the pattern, without calling loginUser", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    const emailInput = screen.getByLabelText(/email/i);

    await user.click(emailInput);
    await user.type(emailInput, "not-an-email");
    await user.tab();

    expect(screen.getByText(/email/i, { selector: "p" })).toBeInTheDocument();
    expect(mockedLoginUser).not.toHaveBeenCalled();
  });

  it("shows the required-field error on blur when the password is empty, without calling loginUser", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/contraseña/i);

    // Empty password stays empty across the blur -- click it, then blur away.
    await user.click(passwordInput);
    await user.click(emailInput);

    expect(screen.getByText(/contraseña/i, { selector: "p" })).toBeInTheDocument();
    expect(mockedLoginUser).not.toHaveBeenCalled();
  });

  it("does NOT show a validation error on blur for a non-empty password under 8 characters -- login has no length minimum, unlike register", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    const passwordInput = screen.getByLabelText(/contraseña/i);

    await user.click(passwordInput);
    await user.type(passwordInput, "short1");
    await user.tab();

    expect(screen.queryByText(/contraseña/i, { selector: "p" })).not.toBeInTheDocument();
    expect(mockedLoginUser).not.toHaveBeenCalled();
  });
});

describe("LoginForm — submit", () => {
  it("a successful submit calls loginUser with the typed values and redirects to /", async () => {
    mockedLoginUser.mockResolvedValueOnce({ outcome: "success", userId: "user-1" });
    const user = userEvent.setup();
    render(<LoginForm />);
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/contraseña/i);
    const button = screen.getByRole("button", { name: /iniciar sesión|ingresar/i });

    await user.click(emailInput);
    await user.type(emailInput, VALID_EMAIL);
    await user.click(passwordInput);
    await user.type(passwordInput, VALID_PASSWORD);
    await user.click(button);

    await waitFor(() =>
      expect(mockedLoginUser).toHaveBeenCalledWith(VALID_EMAIL, VALID_PASSWORD)
    );
    await waitFor(() => expect(mockedPush).toHaveBeenCalledWith("/"));
  });

  it("invalid_credentials shows a generic message without redirecting", async () => {
    mockedLoginUser.mockResolvedValueOnce({ outcome: "invalid_credentials" });
    const user = userEvent.setup();
    render(<LoginForm />);
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/contraseña/i);
    const button = screen.getByRole("button", { name: /iniciar sesión|ingresar/i });

    await user.click(emailInput);
    await user.type(emailInput, VALID_EMAIL);
    await user.click(passwordInput);
    await user.type(passwordInput, VALID_PASSWORD);
    await user.click(button);

    await waitFor(() =>
      expect(mockedNotify).toHaveBeenCalledWith(
        "error",
        "Email o contraseña incorrectos."
      )
    );
    expect(mockedPush).not.toHaveBeenCalled();
  });

  it("too_many_attempts shows its specific message", async () => {
    mockedLoginUser.mockResolvedValueOnce({ outcome: "too_many_attempts" });
    const user = userEvent.setup();
    render(<LoginForm />);
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/contraseña/i);
    const button = screen.getByRole("button", { name: /iniciar sesión|ingresar/i });

    await user.click(emailInput);
    await user.type(emailInput, VALID_EMAIL);
    await user.click(passwordInput);
    await user.type(passwordInput, VALID_PASSWORD);
    await user.click(button);

    await waitFor(() =>
      expect(mockedNotify).toHaveBeenCalledWith(
        "error",
        "Demasiados intentos. Probá de nuevo en unos minutos."
      )
    );
    expect(mockedPush).not.toHaveBeenCalled();
  });

  it("validation_error from the API shows its specific message without redirecting", async () => {
    mockedLoginUser.mockResolvedValueOnce({ outcome: "validation_error" });
    const user = userEvent.setup();
    render(<LoginForm />);
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/contraseña/i);
    const button = screen.getByRole("button", { name: /iniciar sesión|ingresar/i });

    await user.click(emailInput);
    await user.type(emailInput, VALID_EMAIL);
    await user.click(passwordInput);
    await user.type(passwordInput, VALID_PASSWORD);
    await user.click(button);

    await waitFor(() =>
      expect(mockedNotify).toHaveBeenCalledWith(
        "error",
        expect.stringMatching(/formato/i)
      )
    );
    expect(mockedPush).not.toHaveBeenCalled();
  });

  it("unknown_error shows the generic message without redirecting", async () => {
    mockedLoginUser.mockResolvedValueOnce({ outcome: "unknown_error" });
    const user = userEvent.setup();
    render(<LoginForm />);
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/contraseña/i);
    const button = screen.getByRole("button", { name: /iniciar sesión|ingresar/i });

    await user.click(emailInput);
    await user.type(emailInput, VALID_EMAIL);
    await user.click(passwordInput);
    await user.type(passwordInput, VALID_PASSWORD);
    await user.click(button);

    await waitFor(() =>
      expect(mockedNotify).toHaveBeenCalledWith(
        "error",
        expect.stringMatching(/ocurrió un error/i)
      )
    );
    expect(mockedPush).not.toHaveBeenCalled();
  });

  it("a rejected loginUser promise is treated the same as unknown_error", async () => {
    mockedLoginUser.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    render(<LoginForm />);
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/contraseña/i);
    const button = screen.getByRole("button", { name: /iniciar sesión|ingresar/i });

    await user.click(emailInput);
    await user.type(emailInput, VALID_EMAIL);
    await user.click(passwordInput);
    await user.type(passwordInput, VALID_PASSWORD);
    await user.click(button);

    await waitFor(() =>
      expect(mockedNotify).toHaveBeenCalledWith(
        "error",
        expect.stringMatching(/ocurrió un error/i)
      )
    );
    expect(mockedPush).not.toHaveBeenCalled();
  });

  it("the password input has type=\"password\"", () => {
    render(<LoginForm />);
    const passwordInput = screen.getByLabelText(/contraseña/i);
    expect(passwordInput).toHaveAttribute("type", "password");
  });
});
