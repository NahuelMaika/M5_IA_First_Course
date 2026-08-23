import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { registerUser } from "@/lib/api/auth";
import { notify } from "@/lib/notifications/notifications";

import { RegisterForm } from "./register-form";

// Block 4 (spec-FEAT-004b) wires submit to `registerUser` (Block 3). Every test in this file mocks
// both boundary modules so no test ever touches the network or the real toast UI:
// - `@/lib/api/auth`: the ONLY module allowed to build a request towards `apps/api`'s `/auth/*`.
// - `@/lib/notifications/notifications`: the ONLY module allowed to raise a notification.
vi.mock("@/lib/api/auth", () => ({
  registerUser: vi.fn(),
}));
vi.mock("@/lib/notifications/notifications", () => ({
  notify: vi.fn(),
}));

const mockedPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockedPush }),
}));

const mockedRegisterUser = vi.mocked(registerUser);
const mockedNotify = vi.mocked(notify);

const VALID_EMAIL = "persona@example.com";
const VALID_PASSWORD = "unaClave123";

// vitest.setup.ts does not register global afterEach(cleanup) (no `test.globals: true`), so each
// test file with multiple `render()` calls must clean up the DOM itself between tests.
afterEach(() => {
  cleanup();
  mockedRegisterUser.mockReset();
  mockedNotify.mockReset();
  mockedPush.mockReset();
});

describe("RegisterForm — client-side validation", () => {
  it("shows the email-format error on blur when the email does not match the pattern, without calling registerUser", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);
    const emailInput = screen.getByLabelText(/email/i);

    await user.click(emailInput);
    await user.type(emailInput, "not-an-email");
    await user.tab();

    expect(screen.getByText(/email/i, { selector: "p" })).toBeInTheDocument();
    expect(mockedRegisterUser).not.toHaveBeenCalled();
  });

  it("shows the password-length error on blur when the password has fewer than 8 characters, without calling registerUser", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);
    const passwordInput = screen.getByLabelText(/contraseña/i);

    await user.click(passwordInput);
    await user.type(passwordInput, "short1");
    await user.tab();

    expect(screen.getByText(/8 caracteres/i)).toBeInTheDocument();
    expect(mockedRegisterUser).not.toHaveBeenCalled();
  });
});

describe("RegisterForm — submit", () => {
  it("a successful submit calls registerUser with the typed values and redirects to /", async () => {
    mockedRegisterUser.mockResolvedValueOnce({ outcome: "created", userId: "user-1" });
    const user = userEvent.setup();
    render(<RegisterForm />);
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/contraseña/i);
    const button = screen.getByRole("button", { name: /crear cuenta|registrar/i });

    await user.click(emailInput);
    await user.type(emailInput, VALID_EMAIL);
    await user.click(passwordInput);
    await user.type(passwordInput, VALID_PASSWORD);
    await user.click(button);

    await waitFor(() =>
      expect(mockedRegisterUser).toHaveBeenCalledWith(VALID_EMAIL, VALID_PASSWORD)
    );
    await waitFor(() => expect(mockedPush).toHaveBeenCalledWith("/"));
  });

  it("duplicate_email shows the specific message without redirecting", async () => {
    mockedRegisterUser.mockResolvedValueOnce({ outcome: "duplicate_email" });
    const user = userEvent.setup();
    render(<RegisterForm />);
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/contraseña/i);
    const button = screen.getByRole("button", { name: /crear cuenta|registrar/i });

    await user.click(emailInput);
    await user.type(emailInput, VALID_EMAIL);
    await user.click(passwordInput);
    await user.type(passwordInput, VALID_PASSWORD);
    await user.click(button);

    await waitFor(() =>
      expect(mockedNotify).toHaveBeenCalledWith("error", "Ese email ya está registrado.")
    );
    expect(mockedPush).not.toHaveBeenCalled();
  });

  it("validation_error from the API shows the specific message without redirecting", async () => {
    mockedRegisterUser.mockResolvedValueOnce({ outcome: "validation_error" });
    const user = userEvent.setup();
    render(<RegisterForm />);
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/contraseña/i);
    const button = screen.getByRole("button", { name: /crear cuenta|registrar/i });

    await user.click(emailInput);
    await user.type(emailInput, VALID_EMAIL);
    await user.click(passwordInput);
    await user.type(passwordInput, VALID_PASSWORD);
    await user.click(button);

    await waitFor(() =>
      expect(mockedNotify).toHaveBeenCalledWith(
        "error",
        "Revisá el email y la contraseña (mínimo 8 caracteres)."
      )
    );
    expect(mockedPush).not.toHaveBeenCalled();
  });

  it("unknown_error shows the generic message without redirecting", async () => {
    mockedRegisterUser.mockResolvedValueOnce({ outcome: "unknown_error" });
    const user = userEvent.setup();
    render(<RegisterForm />);
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/contraseña/i);
    const button = screen.getByRole("button", { name: /crear cuenta|registrar/i });

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

  it("a rejected registerUser promise is treated the same as unknown_error", async () => {
    mockedRegisterUser.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    render(<RegisterForm />);
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/contraseña/i);
    const button = screen.getByRole("button", { name: /crear cuenta|registrar/i });

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
    render(<RegisterForm />);
    const passwordInput = screen.getByLabelText(/contraseña/i);
    expect(passwordInput).toHaveAttribute("type", "password");
  });
});
